const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SecureVault", function () {
  let vault;
  let owner, guardian, counterparty, otherAccount;
  let secret, commitmentHash, lockDuration;

  const QUARANTINE_STAKE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, guardian, counterparty, otherAccount] = await ethers.getSigners();
    
    secret = ethers.encodeBytes32String("test-secret");
    commitmentHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
    lockDuration = 3600;

    const SecureVault = await ethers.getContractFactory("SecureVault");
    vault = await upgrades.deployProxy(SecureVault, [
        owner.address,
        guardian.address,
        counterparty.address,
        commitmentHash,
        lockDuration
    ], { kind: 'uups' });
  });

  describe("Initial State", function () {
    it("1. Should set the correct initial state", async function () {
      expect(await vault.currentState()).to.equal(0);
    });

    it("2. Should set the correct owner and guardian roles", async function () {
      expect(await vault.owner()).to.equal(owner.address);
      const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
      expect(await vault.hasRole(GUARDIAN_ROLE, guardian.address)).to.be.true;
    });

    it("3. Should prevent double initialization", async function () {
      await expect(vault.initialize(
        owner.address, guardian.address, counterparty.address, commitmentHash, lockDuration
      )).to.be.revertedWithCustomError(vault, "InvalidInitialization");
    });

    it("3b. Should revert with zero address owner", async function () {
      const SecureVault = await ethers.getContractFactory("SecureVault");
      await expect(upgrades.deployProxy(SecureVault, [
        ethers.ZeroAddress, guardian.address, counterparty.address, commitmentHash, lockDuration
      ], { kind: 'uups' })).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });

    it("3c. Should revert with duplicate roles", async function () {
      const SecureVault = await ethers.getContractFactory("SecureVault");
      await expect(upgrades.deployProxy(SecureVault, [
        owner.address, owner.address, counterparty.address, commitmentHash, lockDuration
      ], { kind: 'uups' })).to.be.revertedWithCustomError(vault, "DuplicateRoles");
    });

    it("3d. Should revert with lock duration < 1 hour", async function () {
      const SecureVault = await ethers.getContractFactory("SecureVault");
      await expect(upgrades.deployProxy(SecureVault, [
        owner.address, guardian.address, counterparty.address, commitmentHash, 60
      ], { kind: 'uups' })).to.be.revertedWithCustomError(vault, "LockDurationTooShort");
    });
  });

  describe("Deposits and Locking", function () {
    it("4. Should allow ETH deposit and transition to FUNDED", async function () {
      const depositAmount = ethers.parseEther("1.0");
      await expect(vault.deposit({ value: depositAmount }))
        .to.emit(vault, "Deposited");
      
      expect(await vault.currentState()).to.equal(1);
      expect(await vault.depositedEthAmount()).to.equal(depositAmount);
    });

    it("5. Should transition to LOCKED from FUNDED", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
      expect(await vault.currentState()).to.equal(2);
    });

    it("6. Should prevent non-owner from locking", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await expect(vault.connect(otherAccount).lock()).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("6b. Should revert deposit with zero value", async function () {
      await expect(vault.deposit({ value: 0 })).to.be.revertedWithCustomError(vault, "ZeroDeposit");
    });

    it("6c. Should prevent deposit during quarantine", async function () {
      await vault.initiateQuarantine({ value: QUARANTINE_STAKE });
      await expect(vault.deposit({ value: ethers.parseEther("1.0") })).to.be.revertedWithCustomError(vault, "QuarantineActive");
    });
  });

  describe("Execution Logic", function () {
    beforeEach(async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
    });

    it("7. Should transition to EXECUTION_PENDING with correct secret", async function () {
      await time.increase(lockDuration);
      await expect(vault.initiateExecution(secret))
        .to.emit(vault, "SecretRevealed");
      expect(await vault.currentState()).to.equal(3);
    });

    it("8. Should revert execution before lock duration expires", async function () {
      await expect(vault.initiateExecution(secret)).to.be.revertedWithCustomError(vault, "LockPeriodNotOver");
    });

    it("9. Should revert execution with wrong secret", async function () {
      await time.increase(lockDuration);
      const wrongSecret = ethers.encodeBytes32String("wrong");
      await expect(vault.initiateExecution(wrongSecret)).to.be.revertedWithCustomError(vault, "InvalidSecret");
    });

    it("10. Should allow owner/counterparty to execute and transfer funds", async function () {
      await time.increase(lockDuration);
      await vault.initiateExecution(secret);
      
      const depositAmount = ethers.parseEther("1.0");
      expect(await vault.depositedEthAmount()).to.equal(depositAmount);

      await vault.connect(counterparty).execute();
      
      expect(await vault.currentState()).to.equal(4);
      expect(await vault.depositedEthAmount()).to.equal(0);
    });

    it("10b. Should only transfer deposited amount, not extra ETH", async function () {
      await time.increase(lockDuration);
      await vault.initiateExecution(secret);

      await otherAccount.sendTransaction({
        to: await vault.getAddress(),
        value: ethers.parseEther("0.5")
      });

      const counterpartyBefore = await ethers.provider.getBalance(counterparty.address);
      await vault.connect(counterparty).execute();
      const counterpartyAfter = await ethers.provider.getBalance(counterparty.address);

      expect(counterpartyAfter).to.be.closeTo(counterpartyBefore + ethers.parseEther("1.0"), ethers.parseEther("0.01"));
    });

    it("10c. Should prevent execution during quarantine", async function () {
      await time.increase(lockDuration);
      await vault.initiateExecution(secret);
      await vault.initiateQuarantine({ value: QUARANTINE_STAKE });
      await expect(vault.execute()).to.be.revertedWithCustomError(vault, "QuarantineActive");
    });

    it("10d. Should prevent initiateExecution during quarantine", async function () {
      await vault.initiateQuarantine({ value: QUARANTINE_STAKE });
      await time.increase(lockDuration);
      await expect(vault.initiateExecution(secret)).to.be.revertedWithCustomError(vault, "QuarantineActive");
    });
  });

  describe("Refund and Delay", function () {
    it("11. Should allow refund after lock and delay period", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
      
      const refundDelay = 24 * 60 * 60;
      await time.increase(lockDuration + refundDelay + 1);
      
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      await vault.refund();
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      
      expect(balanceAfter).to.be.closeTo(balanceBefore + ethers.parseEther("1.0"), ethers.parseEther("0.01"));
      expect(await vault.currentState()).to.equal(5);
    });

    it("12. Should revert unauthorized refund", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await expect(vault.connect(otherAccount).refund()).to.be.revertedWithCustomError(vault, "OnlyOwner");
    });

    it("12b. Should allow direct refund from FUNDED state", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      await vault.refund();
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter).to.be.closeTo(balanceBefore + ethers.parseEther("1.0"), ethers.parseEther("0.01"));
    });
  });

  describe("Quarantine and Attack Simulations", function () {
    it("13. Should allow quarantine with stake", async function () {
      await expect(vault.connect(otherAccount).initiateQuarantine({ value: QUARANTINE_STAKE }))
        .to.emit(vault, "Quarantined");
      
      expect(await vault.quarantineInitiator()).to.equal(otherAccount.address);
      expect(await vault.quarantineEndTime()).to.be.gt(await time.latest());
    });

    it("14. Should revert quarantine with wrong stake amount", async function () {
      await expect(vault.connect(otherAccount).initiateQuarantine({ value: ethers.parseEther("0.001") }))
        .to.be.revertedWithCustomError(vault, "MustStakeQuarantine");
    });

    it("15. Attack: Direct ETH send should trigger fallback quarantine", async function () {
      await otherAccount.sendTransaction({
        to: await vault.getAddress(),
        value: QUARANTINE_STAKE
      });
      expect(await vault.quarantineInitiator()).to.equal(otherAccount.address);
    });

    it("16. Invariant Check: deposited amount zero after execute", async function () {
        await vault.deposit({ value: ethers.parseEther("1.0") });
        await vault.lock();
        await time.increase(lockDuration);
        await vault.initiateExecution(secret);
        await vault.execute();
        
        await vault.assertFundIntegrity();
        expect(await vault.depositedEthAmount()).to.equal(0);
    });

    it("17. Owner can release quarantine early", async function () {
      await vault.initiateQuarantine({ value: QUARANTINE_STAKE });
      expect(await vault.quarantineEndTime()).to.be.gt(await time.latest());
      
      await vault.releaseQuarantine();
      const endTime = await vault.quarantineEndTime();
      const latest = await time.latest();
      expect(endTime).to.be.lte(latest);
    });

    it("18. Non-owner cannot release quarantine", async function () {
      await vault.initiateQuarantine({ value: QUARANTINE_STAKE });
      await expect(vault.connect(otherAccount).releaseQuarantine()).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  describe("Token Recovery", function () {
    it("19. Should recover ERC20 tokens after vault closed", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mockToken = await MockERC20.deploy("Mock", "MCK");
      await mockToken.waitForDeployment();

      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
      
      await mockToken.mint(await vault.getAddress(), ethers.parseEther("100"));
      
      await time.increase(lockDuration);
      await vault.initiateExecution(secret);
      await vault.execute();

      await vault.recoverTokens(await mockToken.getAddress(), owner.address);
      expect(await mockToken.balanceOf(owner.address)).to.equal(ethers.parseEther("100"));
    });

    it("20. Should revert token recovery before vault closed", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mockToken = await MockERC20.deploy("Mock", "MCK");

      await vault.deposit({ value: ethers.parseEther("1.0") });
      await expect(vault.recoverTokens(await mockToken.getAddress(), owner.address))
        .to.be.revertedWithCustomError(vault, "VaultNotClosed");
    });
  });

  describe("Pausable", function () {
    it("30. Owner can pause", async function () {
      await expect(vault.pause()).to.emit(vault, "Paused");
      expect(await vault.paused()).to.be.true;
    });

    it("31. Owner can unpause", async function () {
      await vault.pause();
      await expect(vault.unpause()).to.emit(vault, "Unpaused");
      expect(await vault.paused()).to.be.false;
    });

    it("32. Cannot deposit when paused", async function () {
      await vault.pause();
      await expect(vault.deposit({ value: ethers.parseEther("1.0") })).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("33. Cannot lock when paused", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.pause();
      await expect(vault.lock()).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("34. Non-owner cannot pause", async function () {
      await expect(vault.connect(otherAccount).pause()).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("35. Emergency pause stops execution flow", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
      await time.increase(lockDuration);
      await vault.pause();
      await expect(vault.initiateExecution(secret)).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("36. Resume after unpause works normally", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
      await vault.pause();
      await vault.unpause();
      await time.increase(lockDuration);
      await vault.initiateExecution(secret);
      expect(await vault.currentState()).to.equal(3);
    });
  });

  describe("Recovery Account", function () {
    let ownerKey, guardianKey;

    before(async function () {
      const privateKeys = [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      ];
      ownerKey = new ethers.SigningKey(privateKeys[0]);
      guardianKey = new ethers.SigningKey(privateKeys[1]);
    });

    it("21. Should recover account with valid EIP-712 signatures", async function () {
      const newOwner = otherAccount.address;
      const deadline = (await time.latest()) + 3600;
      const currentNonce = await vault.nonce();

      const RECOVERY_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes("Recovery(address newOwner,uint256 nonce,uint256 deadline)"));
      const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint256", "uint256"],
        [RECOVERY_TYPEHASH, newOwner, currentNonce, deadline]
      ));

      const name = "SecureVault";
      const version = "1";
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const verifyingContract = await vault.getAddress();
      const DOMAIN_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
      const domainSeparator = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [DOMAIN_TYPEHASH, ethers.keccak256(ethers.toUtf8Bytes(name)), ethers.keccak256(ethers.toUtf8Bytes(version)), chainId, verifyingContract]
      ));

      const digest = ethers.keccak256(ethers.solidityPacked(
        ["bytes2", "bytes32", "bytes32"],
        ["0x1901", domainSeparator, structHash]
      ));

      const ownerSig = ethers.Signature.from(ownerKey.sign(digest)).serialized;
      const guardianSig = ethers.Signature.from(guardianKey.sign(digest)).serialized;

      await vault.recoverAccount(newOwner, deadline, ownerSig, guardianSig);
      expect(await vault.owner()).to.equal(newOwner);
    });

    it("22. Should revert with expired deadline", async function () {
      const deadline = (await time.latest()) - 1;
      const currentNonce = await vault.nonce();

      const RECOVERY_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes("Recovery(address newOwner,uint256 nonce,uint256 deadline)"));
      const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint256", "uint256"],
        [RECOVERY_TYPEHASH, otherAccount.address, currentNonce, deadline]
      ));

      const name = "SecureVault";
      const version = "1";
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const verifyingContract = await vault.getAddress();
      const DOMAIN_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
      const domainSeparator = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [DOMAIN_TYPEHASH, ethers.keccak256(ethers.toUtf8Bytes(name)), ethers.keccak256(ethers.toUtf8Bytes(version)), chainId, verifyingContract]
      ));

      const digest = ethers.keccak256(ethers.solidityPacked(
        ["bytes2", "bytes32", "bytes32"],
        ["0x1901", domainSeparator, structHash]
      ));

      const ownerSig = ethers.Signature.from(ownerKey.sign(digest)).serialized;
      const guardianSig = ethers.Signature.from(guardianKey.sign(digest)).serialized;

      await expect(vault.recoverAccount(otherAccount.address, deadline, ownerSig, guardianSig))
        .to.be.revertedWithCustomError(vault, "ExpiredDeadline");
    });

    it("23. Should revert recovery to zero address", async function () {
      const deadline = (await time.latest()) + 3600;
      await expect(vault.recoverAccount(ethers.ZeroAddress, deadline, "0x", "0x"))
        .to.be.revertedWithCustomError(vault, "InvalidAddress");
    });

    it("24. Should revert recovery to same owner", async function () {
      const deadline = (await time.latest()) + 3600;
      await expect(vault.recoverAccount(owner.address, deadline, "0x", "0x"))
        .to.be.revertedWithCustomError(vault, "NewOwnerMustDiffer");
    });
  });

  describe("Upgrade Security", function () {
    it("25. Should schedule upgrade with timelock", async function () {
      const newImpl = otherAccount.address;
      await expect(vault.scheduleUpgrade(newImpl))
        .to.emit(vault, "UpgradeScheduled");
    });

    it("26. Should reject upgrade before timelock expires", async function () {
      const newImpl = otherAccount.address;
      await vault.scheduleUpgrade(newImpl);
      await expect(vault.upgradeToAndCall(newImpl, "0x"))
        .to.be.revertedWithCustomError(vault, "InvalidImplementation");
    });

    it("27. Should reject upgrade with zero address", async function () {
      await expect(vault.scheduleUpgrade(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vault, "InvalidImplementation");
    });
  });
});
