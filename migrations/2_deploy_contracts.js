var NewsCoin = artifacts.require("./contracts/NewsCoin.sol");
var NewsCoinMultiSigWallet = artifacts.require("./contracts/NewsCoinMultiSigWallet.sol");
var NewsCoinMultiSigWalletWithMint = artifacts.require("./contracts/NewsCoinMultiSigWalletWithMint.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(NewsCoin, 'NEWS', 'NEWSCoin', accounts[0], accounts[1], accounts[2]).then( () => {
    console.log(`NewsCoin deployed: address = ${NewsCoin.address}`);

    deployer.
      deploy(NewsCoinMultiSigWallet, [accounts[0], accounts[1], accounts[2]], 2, NewsCoin.address,
          "vault multisig wallet");

      deployer.
      deploy(NewsCoinMultiSigWalletWithMint, [accounts[0], accounts[1], accounts[2]], 2, NewsCoin.address,
          "vault multisig wallet with mint");

  });
};
