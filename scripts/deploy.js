const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const guardian = process.env.GUARDIAN_ADDRESS;
  const counterparty = process.env.COUNTERPARTY_ADDRESS;

  if (!guardian || !counterparty) {
    throw new Error("Set GUARDIAN_ADDRESS and COUNTERPARTY_ADDRESS in .env");
  }

  if (guardian === deployer.address || counterparty === deployer.address) {
    throw new Error("Owner, guardian, and counterparty must be different addresses");
  }

  if (guardian === counterparty) {
    throw new Error("Guardian and counterparty must be different addresses");
  }

  const secret = ethers.encodeBytes32String(
    process.env.VAULT_SECRET || "change-me-in-production"
  );
  const commitmentHash = ethers.keccak256(
    ethers.solidityPacked(["bytes32"], [secret])
  );
  const lockDuration = parseInt(process.env.LOCK_DURATION || "86400");

  console.log("Deploying SecureVault proxy...");
  const SecureVault = await ethers.getContractFactory("SecureVault");
  const vault = await upgrades.deployProxy(
    SecureVault,
    [deployer.address, guardian, counterparty, commitmentHash, lockDuration],
    { kind: "uups" }
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("SecureVault proxy deployed to:", vaultAddress);
  console.log("Implementation:", await upgrades.erc1967.getImplementationAddress(vaultAddress));
  console.log("Admin:", await upgrades.erc1967.getAdminAddress(vaultAddress));

  console.log("-----------------------------------");
  console.log("Parameters:");
  console.log("- Owner:", deployer.address);
  console.log("- Guardian:", guardian);
  console.log("- Counterparty:", counterparty);
  console.log("- CommitmentHash:", commitmentHash);
  console.log("- LockDuration:", lockDuration, "seconds");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
