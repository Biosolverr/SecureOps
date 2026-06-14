// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

error InvalidAddress();
error DuplicateRoles();
error LockDurationTooShort();
error InvalidSecret();
error LockPeriodNotOver();
error Unauthorized();
error TransferFailed();
error OnlyOwner();
error RefundNotAvailable();
error MustStakeQuarantine();
error AlreadyQuarantined();
error NoActiveQuarantine();
error InvalidTokenAddress();
error NoTokensReceived();
error VaultNotClosed();
error InvalidRecipient();
error NoTokensToRecover();
error ExpiredDeadline();
error NewOwnerMustDiffer();
error InvalidImplementation();
error FundIntegrityViolated();
error ZeroDeposit();
error QuarantineActive();

contract RolesRegistry {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant COUNTERPARTY_ROLE = keccak256("COUNTERPARTY_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    function _revokeRole(bytes32 role, address account) internal {
        _roles[role][account] = false;
        emit RoleRevoked(role, account);
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }
}

abstract contract UpgradeTimelock {
    uint256 public constant UPGRADE_DELAY = 48 hours;
    uint256 public upgradeTimelock;
    address public pendingImplementation;

    event UpgradeScheduled(address indexed implementation, uint256 releaseTime);

    function _initiateUpgrade(address newImplementation) internal {
        upgradeTimelock = block.timestamp + UPGRADE_DELAY;
        pendingImplementation = newImplementation;
        emit UpgradeScheduled(newImplementation, upgradeTimelock);
    }

    function _checkUpgradeTimelock(address newImplementation) internal view {
        if (newImplementation != pendingImplementation) revert InvalidImplementation();
        if (block.timestamp < upgradeTimelock) revert InvalidImplementation();
    }
}

abstract contract SecureVaultBase {
    bool private _locked;
    modifier nonReentrant() {
        if (_locked) revert InvalidAddress();
        _locked = true;
        _;
        _locked = false;
    }
}

contract SecureVault is 
    UUPSUpgradeable, 
    OwnableUpgradeable, 
    PausableUpgradeable,
    SecureVaultBase, 
    EIP712Upgradeable, 
    RolesRegistry, 
    UpgradeTimelock,
    IERC721Receiver 
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    enum State { INIT, FUNDED, LOCKED, EXECUTION_PENDING, EXECUTED, REFUNDED }

    State public currentState;
    address public counterparty;
    address public guardian;
    bytes32 public commitmentHash;
    uint256 public lockDuration;
    uint256 public lockTimestamp;
    uint256 public refundDelay;
    uint256 public depositedEthAmount;

    uint256 public constant QUARANTINE_STAKE = 0.01 ether;
    uint256 public quarantineEndTime;
    address public quarantineInitiator;

    uint256 public nonce;

    bytes32 public constant RECOVERY_TYPEHASH = keccak256("Recovery(address newOwner,uint256 nonce,uint256 deadline)");

    event Deposited(address indexed sender, uint256 indexed amount, uint256 timestamp);
    event StateChanged(State indexed from, State indexed to, uint256 timestamp);
    event SecretRevealed(bytes32 indexed secretHash);
    event Quarantined(address indexed initiator, uint256 indexed endTime);
    event Refunded(address indexed recipient, uint256 indexed amount, uint256 timestamp);
    event TokensRecovered(address indexed token, address indexed to, uint256 indexed amount);
    event NFTRecovered(address indexed token, address indexed to, uint256 indexed tokenId);


    State private lastState;

    modifier onlyWhileNotQuarantined() {
        if (block.timestamp < quarantineEndTime) revert QuarantineActive();
        _;
    }

    modifier onlyValidAddress(address addr) {
        if (addr == address(0)) revert InvalidAddress();
        _;
    }

    modifier inState(State _state) {
        if (currentState != _state) revert InvalidAddress();
        _;
    }

    modifier noFlashLoan() {
        if (tx.origin != msg.sender) revert Unauthorized();
        _;
    }

    modifier onlyDuringQuarantine() {
        if (block.timestamp >= quarantineEndTime) revert NoActiveQuarantine();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _owner,
        address _guardian,
        address _counterparty,
        bytes32 _commitmentHash,
        uint256 _lockDuration
    ) public initializer onlyValidAddress(_owner) onlyValidAddress(_guardian) onlyValidAddress(_counterparty) {
        if (_lockDuration < 1 hours) revert LockDurationTooShort();
        if (_owner == _guardian || _owner == _counterparty || _guardian == _counterparty) revert DuplicateRoles();

        __Ownable_init(_owner);
        __Pausable_init();
        __EIP712_init("SecureVault", "1");

        guardian = _guardian;
        counterparty = _counterparty;
        commitmentHash = _commitmentHash;
        lockDuration = _lockDuration;
        refundDelay = 24 hours;
        currentState = State.INIT;

        _grantRole(GUARDIAN_ROLE, _guardian);
        _grantRole(COUNTERPARTY_ROLE, _counterparty);
    }

    function pause() external onlyOwner {
        _pause();
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit Unpaused(msg.sender);
    }

    function deposit() external payable nonReentrant whenNotPaused onlyWhileNotQuarantined inState(State.INIT) noFlashLoan {
        if (msg.value == 0) revert ZeroDeposit();
        depositedEthAmount = msg.value;
        currentState = State.FUNDED;
        emit Deposited(msg.sender, msg.value, block.timestamp);
        emit StateChanged(State.INIT, State.FUNDED, block.timestamp);
    }

    function lock() external onlyOwner nonReentrant whenNotPaused onlyWhileNotQuarantined inState(State.FUNDED) {
        currentState = State.LOCKED;
        lockTimestamp = block.timestamp;
        emit StateChanged(State.FUNDED, State.LOCKED, block.timestamp);
    }

    function initiateExecution(bytes32 secret) external whenNotPaused onlyWhileNotQuarantined inState(State.LOCKED) noFlashLoan {
        if (keccak256(abi.encodePacked(secret)) != commitmentHash) revert InvalidSecret();
        if (block.timestamp < lockTimestamp + lockDuration) revert LockPeriodNotOver();

        currentState = State.EXECUTION_PENDING;
        emit SecretRevealed(commitmentHash);
        emit StateChanged(State.LOCKED, State.EXECUTION_PENDING, block.timestamp);
    }

    function execute() external nonReentrant whenNotPaused onlyWhileNotQuarantined inState(State.EXECUTION_PENDING) {
        if (msg.sender != counterparty && msg.sender != owner()) revert Unauthorized();

        currentState = State.EXECUTED;
        uint256 amount = depositedEthAmount;
        depositedEthAmount = 0;

        lastState = State.EXECUTION_PENDING;
        emit StateChanged(State.EXECUTION_PENDING, State.EXECUTED, block.timestamp);

        (bool success, ) = payable(counterparty).call{value: amount}("");
        if (!success) revert TransferFailed();

        assertFundIntegrity();
    }

    function refund() external nonReentrant {
        if (msg.sender != owner()) revert OnlyOwner();
        if (currentState != State.FUNDED && 
            (currentState != State.LOCKED || block.timestamp < lockTimestamp + lockDuration + refundDelay)) {
            revert RefundNotAvailable();
        }

        uint256 amount = depositedEthAmount;
        depositedEthAmount = 0;
        lastState = currentState;
        currentState = State.REFUNDED;

        emit StateChanged(lastState, State.REFUNDED, block.timestamp);
        emit Refunded(msg.sender, amount, block.timestamp);

        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();

        assertFundIntegrity();
    }

    function initiateQuarantine() external payable onlyWhileNotQuarantined {
        if (msg.value != QUARANTINE_STAKE) revert MustStakeQuarantine();
        if (quarantineEndTime >= block.timestamp) revert AlreadyQuarantined();

        quarantineInitiator = msg.sender;
        quarantineEndTime = block.timestamp + 12 hours;
        emit Quarantined(msg.sender, quarantineEndTime);
    }

    function releaseQuarantine() external onlyOwner onlyDuringQuarantine {
        quarantineEndTime = block.timestamp;
    }

    function depositTokens(address token, uint256 amount) external nonReentrant whenNotPaused onlyWhileNotQuarantined {
        if (token == address(0)) revert InvalidTokenAddress();
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        if (balanceAfter - balanceBefore == 0) revert NoTokensReceived();
    }

    function recoverTokens(address token, address to) external onlyOwner {
        if (currentState != State.EXECUTED && currentState != State.REFUNDED) revert VaultNotClosed();
        if (to == address(0)) revert InvalidRecipient();
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert NoTokensToRecover();
        IERC20(token).safeTransfer(to, balance);
        emit TokensRecovered(token, to, balance);
    }

    function recoverNFT(address token, address to, uint256 tokenId) external onlyOwner {
        if (currentState != State.EXECUTED && currentState != State.REFUNDED) revert VaultNotClosed();
        if (to == address(0)) revert InvalidRecipient();
        IERC721(token).safeTransferFrom(address(this), to, tokenId);
        emit NFTRecovered(token, to, tokenId);
    }

    function recoverAccount(
        address newOwner,
        uint256 deadline,
        bytes calldata ownerSignature,
        bytes calldata guardianSignature
    ) external onlyValidAddress(newOwner) {
        if (block.timestamp > deadline) revert ExpiredDeadline();
        if (newOwner == owner()) revert NewOwnerMustDiffer();

        bytes32 structHash = keccak256(abi.encode(RECOVERY_TYPEHASH, newOwner, nonce, deadline));
        bytes32 hash = _hashTypedDataV4(structHash);

        address signer1 = hash.recover(ownerSignature);
        address signer2 = hash.recover(guardianSignature);

        if (signer1 != owner()) revert Unauthorized();
        if (signer2 != guardian) revert Unauthorized();

        unchecked { nonce++; }
        _transferOwnership(newOwner);
    }

    function assertFundIntegrity() public view {
        if (currentState == State.EXECUTED || currentState == State.REFUNDED) {
            if (depositedEthAmount != 0) revert FundIntegrityViolated();
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        _checkUpgradeTimelock(newImplementation);
    }

    function scheduleUpgrade(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert InvalidImplementation();
        _initiateUpgrade(newImplementation);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        if (msg.value == QUARANTINE_STAKE && quarantineEndTime < block.timestamp) {
            quarantineInitiator = msg.sender;
            quarantineEndTime = block.timestamp + 12 hours;
            emit Quarantined(msg.sender, quarantineEndTime);
        }
    }
}
