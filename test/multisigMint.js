'use strict';

const NewsCoin = artifacts.require('NewsCoin.sol');
const NewsCoinMultiSigFactory = artifacts.require('NewsCoinMultiSigWalletWithMint.sol');
const web3 = NewsCoin.web3;
const eth = web3.eth;
const theBN = require("bn.js")

const NOT_FULLY_SIGNED = 0;
const FULLY_SIGNED = 1;
const EXECUTED = 2;

/*
    enum TxType {
        SIGNER_ADD, SIGNER_REMOVE,
        MINTER_ADD, MINT
    }
 */
const SIGNER_ADD = 0;
const SIGNER_REMOVE = 1;
const MINTER_ADD = 2;
const MINT = 3;

// get eth balance
const ethBalanceOf = (account) => eth.getBalance(account);

const deployMultiSigWallet = (owners, requiredConfirm, coin) => {
  return NewsCoinMultiSigFactory.new(owners, requiredConfirm, coin, "vault");
};

const deployNewsCoin = (owner,admin,vault) => {
  return NewsCoin.new("News", "NewsCoin", owner, admin, vault);
};

const printTx = (tx) => {
  for(let i=0; i<tx.logs.length; i++) {
    console.log(`------------------------------------`);
    console.log(`tx.logs[${i}]`);
    for(let key in tx.logs[i]) {
      if(key == "args") {
        for(let argname in tx.logs[i]["args"]) {
          console.log(`TX[${key}][${argname}] = ${tx.logs[i][key][argname]}`);
        }
      } else {
        console.log(`TX[${key}] = ${tx.logs[i][key]}`);
      }
    }
  }
};

const getEventParameterFromTx = (tx, _event, param) => {
  const found = tx.logs
    .filter(({event}) => event === _event)

  if(found.length >= 1) {
    const foundParam = found[0].args[param]
    if(!foundParam)
      assert.fail();
    else
      return foundParam;
  } else {
    assert.fail();
  }
};

const mkPromise = ftWithCallback =>
  new Promise((resolve, reject) =>
    ftWithCallback((err, res) => {
      if (err) { reject(err); } else { resolve(res); }
    })
  )

// some functional flavour
const _zip = a => b => a.map((e, i) => [e, b[i]]);
const _map = a => f => a.map(f);
const _mkString = a => delim => a.join(delim);
const _compose = (...fs) =>
  fs.reverse().reduce((f1, f2) =>
      v => f2(f1(v)),
      v => v
  );
const _then = (...fs) =>
  fs.reduce((f1, f2) =>
      v => f2(f1(v)),
    v => v
  );

const trRequestIndexMap = {
  desc: 0,
  txType: 1,
  status: 2,
  who: 3,
  amount: 4
};

const assertTxRequest = (txRequest, desc, txType, status, who, amount=0) => {
  assert.equal(txRequest[trRequestIndexMap.desc], desc);
  assert.equal(txRequest[trRequestIndexMap.txType], txType);
  assert.equal(txRequest[trRequestIndexMap.status], status);
  assert.equal(txRequest[trRequestIndexMap.who], who);
  assert.equal(txRequest[trRequestIndexMap.amount], amount);
};

const assertTxRequestStateOnly = (txRequest, desc, txType, status) => {
  assert.equal(txRequest[trRequestIndexMap.desc], desc);
  assert.equal(txRequest[trRequestIndexMap.txType], txType);
  assert.equal(txRequest[trRequestIndexMap.status], status);
};

const ONE_DAY = 24 * 3600;

contract("NewsCoinMultiSigWalletWithMint", (accounts) => {
  const BIG = (v) => new theBN.BN(v)
  let coinInstance;
  let walletInstance;
  const requiredConfirmations = 2;

  let OneNewsCoinInMinunit;
  let NoOfTokens, NoOfTokensInMinunit;

  const owner = accounts[0];
  const admin = accounts[1];
  const vault = accounts[2];
  const minter = accounts[0];

  const user1 = accounts[4];
  const user2 = accounts[5];
  const user3 = accounts[6];
  const signer = accounts[7];

  const ownerBalance = ethBalanceOf(owner);
  const adminBalance = ethBalanceOf(admin);
  const vaultBalance = ethBalanceOf(vault);
  const minterBalance = ethBalanceOf(minter);
  const user1Balance = ethBalanceOf(user1);
  const user2Balance = ethBalanceOf(user2);
  const user3Balance = ethBalanceOf(user3);
  const signerBalance = ethBalanceOf(signer);

  console.log(`using owner = ${owner} balance=${ownerBalance}`);
  console.log(`using admin = ${admin} balance=${adminBalance}`);
  console.log(`using vault = ${vault} balance=${vaultBalance}`);
  console.log(`using user1 = ${user1} balance=${user1Balance}`);
  console.log(`using user2 = ${user2} balance=${user2Balance}`);
  console.log(`using user3 = ${user3} balance=${user3Balance}`);
  console.log(`using signer = ${signer} balance=${signerBalance}`);
  console.log(`using minter = ${minter} balance=${minterBalance}`);

  // 어카운트 잔고 호출을 단순화 해주기 위한 함수
  const bnBalanceOf = (account) => coinInstance.balanceOf(account);
  const balanceOf = async (account) => (await coinInstance.balanceOf(account)).toString();


  const assertRevert = async (msg, ft) => {
    try {
      await ft();
      console.log(`AssetionFail: Exception not occurred while runing ${msg} ${ft}`);
      assert.fail();
    } catch(exception) {
      try {
        assert.isTrue(exception.message.includes("revert"));
      } catch(exception2) {
        console.log(`Assert fail while runing ${msg} ${ft}: ${exception.message}`);
        throw exception2;
      }
    }
  }

  const assertNotRevert = async (msg, ft) => {
    try {
      const x = await ft();
      return x;
    } catch(exception) {
      console.log(`Assert fail while running ${msg} ${ft}: ${exception.message}`);
      assert.fail();
    }
  }

  beforeEach(async () => {
    coinInstance = await deployNewsCoin(owner, admin, vault);
    assert.ok(coinInstance);

    NoOfTokensInMinunit = await coinInstance.totalSupply();
    OneNewsCoinInMinunit = await coinInstance.getOneNewsCoin();
    NoOfTokens = NoOfTokensInMinunit.div(OneNewsCoinInMinunit);

    walletInstance = await deployMultiSigWallet([signer,admin,vault], 2, coinInstance.address);
    assert.ok(walletInstance);

    await coinInstance.addMinter(walletInstance.address, {from: owner})
  });

  it("multisig wallet basic functions", async () => {
    assert.equal( await walletInstance.newsCoin(), coinInstance.address );

    // getOwners can be executed by owners only
    assert.deepEqual( await walletInstance.getSigners({from: signer}), [signer, admin, vault]);
    assert.deepEqual( await walletInstance.getSigners({from: admin}), [signer, admin, vault]);
    assert.deepEqual( await walletInstance.getSigners({from: vault}), [signer, admin, vault]);
  });

  it("via TX only functions", async () => {
    assertRevert("addSigner directly",() => walletInstance.addSigner(user1, {from: admin}));
    assertRevert("removeSigner directly",() => walletInstance.removeSigner(admin, {from: admin}));
  });

  it("Signer add self should not possible", async () => {
    assertRevert("add signer self", () => walletInstance.requestSignerAdd(signer, "Add Signer signer using signer herself", {from: signer}));
    assertRevert("add vault self", () => walletInstance.requestSignerAdd(vault, "Add Signer vault using vault herself", {from: vault}));
    assertRevert("add admin self", () => walletInstance.requestSignerAdd(admin, "Add Signer vault using admin herself", {from: admin}));
  });

  it("Add a signer", async () => {
    let trSubmit = await walletInstance.requestSignerAdd(user1, "Add Signer user1", {from: signer});
    const txID = getEventParameterFromTx( trSubmit, "SignerAddRequested", "id" );
    assertNotRevert(`Sign AddSigner(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

    // user1 should be in the signer list
    assert.deepEqual( await walletInstance.getSigners({from: signer}), [signer, admin, vault, user1]);

    // user1 himself should call the signer only functions
    assert.deepEqual( await walletInstance.getSigners({from: user1}), [signer, admin, vault, user1]);
    assertNotRevert("signer1",() => walletInstance.requestMintInNews(user1, 1, 0, "test addsigner-1", {from: user1}));
    assertNotRevert("signer2",() => walletInstance.requestMintInMinunit(user1, 1, "test addsigner-2", {from: user1}));
    assertNotRevert("signer3",() => walletInstance.requestSignerAdd(user2, "test addsigner-3", {from: user1}));
    assertNotRevert("signer4",() => walletInstance.requestSignerRemove(vault, "test addsigner-4", {from: user1}));
  });

  it("Remove a signer", async () => {

    // first add user1 to the signers
    let trSubmit = await walletInstance.requestSignerAdd(user1, "Add Signer user1", {from: signer});
    let txID = getEventParameterFromTx( trSubmit, "SignerAddRequested", "id" );
    await assertNotRevert(`Sign AddSigner(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

    // user1 should be in the signer list
    assert.deepEqual(await walletInstance.getSigners({from: signer}), [signer, admin, vault, user1]);

    // Now remove the added signer user1
    trSubmit = await walletInstance.requestSignerRemove(user1, "Remove Signer user1", {from: signer});
    txID = getEventParameterFromTx( trSubmit, "SignerRemoveRequested", "id" );
    await assertNotRevert(`Sign RemoveSigner(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

    // user1 should not be in the signer list
    assert.deepEqual(await walletInstance.getSigners({from: signer}), [signer, admin, vault]);

    // user1 should not be able to call the signer functions
    assertRevert("signer1",() => walletInstance.requestMintInNews(user1, 1, 0, "test addsigner-1", {from: user1}));
    assertRevert("signer2",() => walletInstance.requestMintInMinunit(user1, 1, "test addsigner-2", {from: user1}));
    assertRevert("signer3",() => walletInstance.requestSignerAdd(user2, "test addsigner-3", {from: user1}));
    assertRevert("signer4",() => walletInstance.requestSignerRemove(vault, "test addsigner-4", {from: user1}));
  });

  it("Remove too many signer", async () => {
    // Remove first signer
    let trSubmit = await walletInstance.requestSignerRemove(signer, "Remove Signer signer", {from: signer});
    let txID = getEventParameterFromTx( trSubmit, "SignerRemoveRequested", "id" );
    await assertNotRevert(`Sign RemoveSigner(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

    assertRevert("remove second to last signer",
      () => walletInstance.requestSignerRemove(admin, "Remove Signer admin", {from: admin}));
  });

  it("Add and remove a minter", async () => {
      let trSubmit = await walletInstance.requestMinterAdd(user1, "Add Minter user1", {from: signer});
      const txID = getEventParameterFromTx( trSubmit, "MinterAddRequested", "id" );
      assertNotRevert(`Sign AddMinter(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

      // user1 shold be able to mint coin
      let prevBalance = await coinInstance.balanceOf(user1);
      assertNotRevert("user1 can mint", () => coinInstance.mint(user1, OneNewsCoinInMinunit, {from: user1}));
      let afterBalance = await coinInstance.balanceOf(user1);

      // balance difference should be same as the minted amount
      assert.equal(afterBalance.sub(prevBalance).toString(), OneNewsCoinInMinunit.toString());

      assertNotRevert(`revoke minter`,() => coinInstance.renounceMinter({from: user1}));

      // user1 cannot mint any more
      prevBalance = await coinInstance.balanceOf(user1);
      assertRevert("user1 cannot mint after renounce", () => coinInstance.mint(user1, OneNewsCoinInMinunit, {from: user1}));
      afterBalance = await coinInstance.balanceOf(user1);

      assert.equal(afterBalance.toString(), prevBalance.toString());
  });

  it("Remove a signer", async () => {

      // first add user1 to the signers
      let trSubmit = await walletInstance.requestSignerAdd(user1, "Add Signer user1", {from: signer});
      let txID = getEventParameterFromTx( trSubmit, "SignerAddRequested", "id" );
      await assertNotRevert(`Sign AddSigner(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

      // user1 should be in the signer list
      assert.deepEqual(await walletInstance.getSigners({from: signer}), [signer, admin, vault, user1]);

      // Now remove the added signer user1
      trSubmit = await walletInstance.requestSignerRemove(user1, "Remove Signer user1", {from: signer});
      txID = getEventParameterFromTx( trSubmit, "SignerRemoveRequested", "id" );
      await assertNotRevert(`Sign RemoveSigner(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

      // user1 should not be in the signer list
      assert.deepEqual(await walletInstance.getSigners({from: signer}), [signer, admin, vault]);

      // user1 should not be able to call the signer functions
      assertRevert("signer1",() => walletInstance.requestMintInNews(user1, 1, 0, "test addsigner-1", {from: user1}));
      assertRevert("signer2",() => walletInstance.requestMintInMinunit(user1, 1, "test addsigner-2", {from: user1}));
      assertRevert("signer3",() => walletInstance.requestSignerAdd(user2, "test addsigner-3", {from: user1}));
      assertRevert("signer4",() => walletInstance.requestSignerRemove(vault, "test addsigner-4", {from: user1}));
  });

  it("test mint using multisig wallet", async () => {
        // intial balance check
        const initialBalance = await bnBalanceOf(user1);
        assert.equal(initialBalance.toString(), "0");

        const thousandNewsInMinunit = OneNewsCoinInMinunit.mul(BIG(1000))
        const thousandNews = BIG(1000)
        const zero = BIG(0)

        const MSG1 = "MINT 1000 News to user1";
        const trSubmit = await walletInstance.requestMintInNews(user1, thousandNews, zero, MSG1, {from:vault});

        //printTx(trSubmit);
        const txID = getEventParameterFromTx( trSubmit, "MintRequested", "id" );
        //console.log(`TX id = ${txID}`);

        // get transaction info
        // NOTE: requestMap returns not the structure, but the ordered list of fields.
        //       the field order is just same as the .sol contract's TXRequest struct.
        const txRequest = await walletInstance.viewTX(txID, {from:vault});
        const txSigns = await walletInstance.viewWhoSignTX(txID, {from:vault});

        //console.log(`TX Requested = {${txRequest}}`);
        //console.log(txRequest);
        //console.log(`TX Confirms = ${txSigns.join(",")}`);

        assertTxRequestStateOnly(txRequest, MSG1, MINT, NOT_FULLY_SIGNED);
        assert.equal(txSigns.length,1);
        assert.equal(txSigns[0],vault);


        // 2 sign -> execute the TX
        const trSign = await walletInstance.signTX(txID, {from: admin});
        //printTx(trSign);
        const afterBalance = await bnBalanceOf(user1);
        // on truffle or ganache, gas fee fail does not occur
        assert.equal(afterBalance.toString(), thousandNewsInMinunit.toString());

        // check request TX status
        const txRequest2 = await walletInstance.viewTX(txID, {from:vault});
        const txSigns2 = await walletInstance.viewWhoSignTX(txID, {from:vault});

        //(txRequest, desc, abi, executed, cancelled, confirmed, contractAddr = 0, expiry=FOREVER )
        assertTxRequestStateOnly(txRequest2, MSG1, MINT, EXECUTED);

        assert.equal(txSigns2.length,2);
        assert.equal(txSigns2[0],vault);
        assert.equal(txSigns2[1],admin);
    });
});
