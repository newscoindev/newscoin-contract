'use strict';

const NewsCoin = artifacts.require('NewsCoin.sol');
const NewsCoinMultiSigFactory = artifacts.require('NewsCoinMultiSigWallet.sol');
const web3 = NewsCoin.web3;
const eth = web3.eth;
const theBN = require("bn.js")

const NOT_FULLY_SIGNED = 0;
const FULLY_SIGNED = 1;
const EXECUTED = 2;

/*
    enum TxType {
        0: TRANSFER,
        1: SIGNER_ADD, SIGNER_REMOVE,
        3: ADMIN_CHANGE, VAULT_CHANGE, OWNER_CHANGE,
    }
 */
const TRANSFER = 0;
const SIGNER_ADD = 1;
const SIGNER_REMOVE = 2;

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

contract("NewsCoinMultiSigWallet", (accounts) => {
  const BIG = (v) => new theBN.BN(v)
  let coinInstance;
  let walletInstance;
  const requiredConfirmations = 2;

  let OneNewsCoinInMinunit;
  let NoOfTokens, NoOfTokensInMinunit;

  const owner = accounts[0];
  const admin = accounts[1];
  const vault = accounts[2];
  const minter = accounts[3];
  const user1 = accounts[4];
  const user2 = accounts[5];
  const user3 = accounts[6];
  const signer = accounts[7];

  const ownerBalance = ethBalanceOf(owner);
  const adminBalance = ethBalanceOf(admin);
  const vaultBalance = ethBalanceOf(vault);
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
  });

  it("multisig wallet basic functions", async () => {
    assert.equal( await walletInstance.newsCoin(), coinInstance.address );

    // getOwners can be executed by owners only
    assert.deepEqual( await walletInstance.getSigners({from: signer}), [signer, admin, vault]);
    assert.deepEqual( await walletInstance.getSigners({from: admin}), [signer, admin, vault]);
    assert.deepEqual( await walletInstance.getSigners({from: vault}), [signer, admin, vault]);

    // Send money to wallet is not possible
    //const Deposit = 10000000000;  // 1e10 Wei
    //try {
    //  await eth.sendTransaction({to: walletInstance.address, value: Deposit, from: accounts[0]});
    //  assert.fail();
    //} catch(exception) {
    //  assert.isTrue(exception.message.includes("revert"));
    //}
  });

  it("via TX only functions", async () => {
    assertRevert("addSigner directly",() => walletInstance.addSigner(user1, {from: admin}));
    assertRevert("removeSigner directly",() => walletInstance.removeSigner(admin, {from: admin}));
  });

  it("only signers can request TX", async () => {
    // user1 cannot
    assertRevert("1-1",() => walletInstance.requestTransferInNews(user1, 1, 0, "test 1", {from: user1}));
    assertRevert("1-2",() => walletInstance.requestTransferInMinunit(user1, 1, "test 2", {from: user1}));
    assertRevert("1-3",() => walletInstance.requestSignerAdd(user1, "test 3", {from: user1}));
    assertRevert("1-4",() => walletInstance.requestSignerRemove(vault, "test 4", {from: user1}));
    assertRevert("1-5",() => walletInstance.requestAdminChange(user2, "test 5", {from: user1}));
    assertRevert("1-6",() => walletInstance.requestVaultChange(user2, "test 6", {from: user1}));
    assertRevert("1-7",() => walletInstance.requestOwnerChange(user2, "test 7", {from: user1}));

    // owner cannot
    assertRevert("2-1",() => walletInstance.requestTransferInNews(user1, 1, 0, "test 2-1", {from: owner}));
    assertRevert("2-2",() => walletInstance.requestTransferInMinunit(user1, 1, "test 2-2", {from: owner}));
    assertRevert("2-3",() => walletInstance.requestSignerAdd(user1, "test 2-3", {from: owner}));
    assertRevert("2-4",() => walletInstance.requestSignerRemove(vault, "test 2-4", {from: owner}));
    assertRevert("2-5",() => walletInstance.requestAdminChange(user2, "test 2-5", {from: owner}));
    assertRevert("2-6",() => walletInstance.requestVaultChange(user2, "test 2-6", {from: owner}));
    assertRevert("2-7",() => walletInstance.requestOwnerChange(user2, "test 2-7", {from: owner}));

    // admin(as signer) can
    assertNotRevert("3-1",() => walletInstance.requestTransferInNews(user1, 1, 0, "test 3-1", {from: admin}));
    assertNotRevert("3-2",() => walletInstance.requestTransferInMinunit(user1, 1, "test 3-2", {from: admin}));
    assertNotRevert("3-3",() => walletInstance.requestSignerAdd(user1, "test 3-3", {from: admin}));
    assertNotRevert("3-4",() => walletInstance.requestSignerRemove(vault, "test 3-4", {from: admin}));
    assertNotRevert("3-5",() => walletInstance.requestAdminChange(user2, "test 3-5", {from: admin}));
    assertNotRevert("3-6",() => walletInstance.requestVaultChange(user2, "test 3-6", {from: admin}));
    assertNotRevert("3-7",() => walletInstance.requestOwnerChange(user2, "test 3-7", {from: admin}));

    // vault(as signer) can
    assertNotRevert("4-1",() => walletInstance.requestTransferInNews(user1, 1, 0, "test 4-1", {from: vault}));
    assertNotRevert("4-2",() => walletInstance.requestTransferInMinunit(user1, 1, "test 4-2", {from: vault}));
    assertNotRevert("4-3",() => walletInstance.requestSignerAdd(user1, "test 4-3", {from: vault}));
    assertNotRevert("4-4",() => walletInstance.requestSignerRemove(vault, "test 4-4", {from: vault}));
    assertNotRevert("4-5",() => walletInstance.requestAdminChange(user2, "test 4-5", {from: vault}));
    assertNotRevert("4-6",() => walletInstance.requestVaultChange(user2, "test 4-6", {from: vault}));
    assertNotRevert("4-7",() => walletInstance.requestOwnerChange(user2, "test 4-7", {from: vault}));

    // signer(as signer) can
    assertNotRevert("5-1",() => walletInstance.requestTransferInNews(user1, 1, 0, "test 5-1", {from: signer}));
    assertNotRevert("5-2",() => walletInstance.requestTransferInMinunit(user1, 1, "test 5-2", {from: signer}));
    assertNotRevert("5-3",() => walletInstance.requestSignerAdd(user1, "test 5-3", {from: signer}));
    assertNotRevert("5-4",() => walletInstance.requestSignerRemove(vault, "test 5-4", {from: signer}));
    assertNotRevert("5-5",() => walletInstance.requestAdminChange(user2, "test 5-5", {from: signer}));
    assertNotRevert("5-6",() => walletInstance.requestVaultChange(user2, "test 5-6", {from: signer}));
    assertNotRevert("5-7",() => walletInstance.requestOwnerChange(user2, "test 5-7", {from: signer}));
  });

  it("signers only methods", async () => {
    // request a TX
    walletInstance.requestTransferInNews(user1, 1, 0, "test 1", {from: signer});

    // test signer can call functions
    assertNotRevert("12-1",() => walletInstance.viewWhoSignTX(0, {from:signer}));
    assertNotRevert("12-2",() => walletInstance.viewTX(0, {from:signer}));
    assertNotRevert("12-3",() => walletInstance.viewWhoSignTX(0, {from:signer}));
    assertNotRevert("12-4",() => walletInstance.getSigners({from:signer}));

    // non-signer callable function
    assertNotRevert("13-1",() => walletInstance.getTxCount({from:user1}));
    assertNotRevert("13-1",() => walletInstance.getTxCount({from:signer}));

    // non-signer uncallable functions
    assertRevert("14-1",() => walletInstance.viewWhoSignTX(0, {from:user1}));
    assertRevert("14-2",() => walletInstance.viewTX(0, {from:user1}));
    assertRevert("14-3",() => walletInstance.viewWhoSignTX(0, {from:user1}));
    assertRevert("14-4",() => walletInstance.getSigners({from:user1}));
  });

  it("test transfer using multisig wallet", async () => {
    // intial balance check
    const initialBalance = await bnBalanceOf(user1);
    assert.equal(initialBalance.toString(), "0");
    const vaultInitBalance = await bnBalanceOf(vault);
    assert.equal(vaultInitBalance.toString(), NoOfTokensInMinunit.toString());
    assert.equal((await ethBalanceOf(walletInstance.address)).toString(),"0");  // initially no eth on walletInstance(gas fee reserve)

    const thousandNewsInMinunit = OneNewsCoinInMinunit.mul(BIG(1000))
    coinInstance.transfer(walletInstance.address, thousandNewsInMinunit, {from:vault});
    assert.equal(await balanceOf(walletInstance.address), thousandNewsInMinunit.toString());

    // Add newscoin transfer transaction
    // example ABI generation:
    // const transferData = coinInstance.contract.transfer.getData(user1, OneNewsCoin * 1);
    //

    const MSG1 = "send 1News and 1DENNIS to user1";
    const trSubmit = await walletInstance.requestTransferInNews(user1, 1, 1, MSG1, {from:vault});

    //printTx(trSubmit);
    const txID = getEventParameterFromTx( trSubmit, "TransferRequested", "id" );
    //console.log(`TX id = ${txID}`);

    // get transaction info
    // NOTE: requestMap returns not the structure, but the ordered list of fields.
    //       the field order is just same as the .sol contract's TXRequest struct.
    const txRequest = await walletInstance.viewTX(txID, {from:vault});
    const txSigns = await walletInstance.viewWhoSignTX(txID, {from:vault});

    //console.log(`TX Requested = {${txRequest}}`);
    //console.log(txRequest);
    //console.log(`TX Confirms = ${txSigns.join(",")}`);

    assertTxRequestStateOnly(txRequest, MSG1, TRANSFER, NOT_FULLY_SIGNED);
    assert.equal(txSigns.length,1);
    assert.equal(txSigns[0],vault);

    //
    // TODO: if web3.eth can parse the returned structure ABI,
    //       we can use below code instead of the above `walletInstance.requestMap(txID)`
    // get transaction info
    //console.log('##### viewTX()');
    //const tx1 = await walletInstance.viewTX(txID);
    //console.log(`tx just after requesting = ${tx1}`);
    //

    // 2 sign -> execute the TX
    const trSign = await walletInstance.signTX(txID, {from: admin});
    //printTx(trSign);
    const afterBalance = await bnBalanceOf(user1);
    assert.equal(afterBalance.toString(), OneNewsCoinInMinunit.mul(BIG(1)).add(BIG(1)).toString());

    // check request TX status
    const txRequest2 = await walletInstance.viewTX(txID, {from:vault});
    const txSigns2 = await walletInstance.viewWhoSignTX(txID, {from:vault});

    //(txRequest, desc, abi, executed, cancelled, confirmed, contractAddr = 0, expiry=FOREVER )
    assertTxRequestStateOnly(txRequest2, MSG1, TRANSFER, EXECUTED);

    assert.equal(txSigns2.length,2);
    assert.equal(txSigns2[0],vault);
    assert.equal(txSigns2[1],admin);
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
    assertNotRevert("signer1",() => walletInstance.requestTransferInNews(user2, 1, 0, "test addsigner-1", {from: user1}));
    assertNotRevert("signer2",() => walletInstance.requestTransferInMinunit(user2, 1, "test addsigner-2", {from: user1}));
    assertNotRevert("signer3",() => walletInstance.requestSignerAdd(user2, "test addsigner-3", {from: user1}));
    assertNotRevert("signer4",() => walletInstance.requestSignerRemove(vault, "test addsigner-4", {from: user1}));
    assertNotRevert("signer5",() => walletInstance.requestAdminChange(user2, "test addsigner-5", {from: user1}));
    assertNotRevert("signer6",() => walletInstance.requestVaultChange(user2, "test addsigner-6", {from: user1}));
    assertNotRevert("signer7",() => walletInstance.requestOwnerChange(user2, "test addsigner-7", {from: user1}));
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
    assertRevert("signer1",() => walletInstance.requestTransferInNews(user1, 1, 0, "test addsigner-1", {from: user1}));
    assertRevert("signer2",() => walletInstance.requestTransferInMinunit(user1, 1, "test addsigner-2", {from: user1}));
    assertRevert("signer3",() => walletInstance.requestSignerAdd(user2, "test addsigner-3", {from: user1}));
    assertRevert("signer4",() => walletInstance.requestSignerRemove(vault, "test addsigner-4", {from: user1}));
    assertRevert("signer5",() => walletInstance.requestAdminChange(user2, "test addsigner-5", {from: user1}));
    assertRevert("signer6",() => walletInstance.requestVaultChange(user2, "test addsigner-6", {from: user1}));
    assertRevert("signer7",() => walletInstance.requestOwnerChange(user2, "test addsigner-7", {from: user1}));
  });

  it("Remove too many signer", async () => {
    // Remove first signer
    let trSubmit = await walletInstance.requestSignerRemove(signer, "Remove Signer signer", {from: signer});
    let txID = getEventParameterFromTx( trSubmit, "SignerRemoveRequested", "id" );
    await assertNotRevert(`Sign RemoveSigner(txid=${txID})`,() => walletInstance.signTX(txID, {from: admin}));

    assertRevert("remove second to last signer",
      () => walletInstance.requestSignerRemove(admin, "Remove Signer admin", {from: admin}));
  });

  it("change owner", async () => {
    // setting for testing change admin
    const contractVault = walletInstance.address;
    await coinInstance.setVault(contractVault, {from: owner});
    assert.equal(contractVault, await coinInstance.getVault({from: owner}));
    //await web3.eth.sendTransaction({from: user1, to:contractVault, value: web3.toWei(2, 'ether')});

    // change owner request
    let trSubmit = await walletInstance.requestOwnerChange(signer, "owner change to signer", {from: signer});
    let txID = getEventParameterFromTx( trSubmit, "OwnerChangeRequested", "id" );
    await walletInstance.signTX(txID, {from: admin});

    // check changed owner
    assert.equal(await coinInstance.getOwner({from:admin}), signer);
  });

  it("change admin using vault contract", async () => {
    // setting for testing change admin
    const contractVault = walletInstance.address;
    await coinInstance.setVault(contractVault, {from: owner});
    assert.equal(contractVault, await coinInstance.getVault({from: owner}));
    //await web3.eth.sendTransaction({from: user1, to:contractVault, value: web3.toWei(2, 'ether')});

    // change admin request
    let trSubmit = await walletInstance.requestAdminChange(signer, "admin change to signer", {from: signer});
    let txID = getEventParameterFromTx( trSubmit, "AdminChangeRequested", "id" );
    await walletInstance.signTX(txID, {from: admin});

    // check changed admin
    assert.equal(await coinInstance.getAdmin({from:owner}), signer);
  });

  it("change admin using owner contract", async () => {
    // setting for testing change admin
    const contractOwner = walletInstance.address;
    await coinInstance.setOwner(contractOwner, {from: vault});
    assert.equal(contractOwner, await coinInstance.getOwner({from: vault}));
    //await web3.eth.sendTransaction({from: user1, to:contractOwner, value: web3.toWei(2, 'ether')});

    // change admin request
    let trSubmit = await walletInstance.requestAdminChange(signer, "admin change to signer", {from: signer});
    let txID = getEventParameterFromTx( trSubmit, "AdminChangeRequested", "id" );
    await walletInstance.signTX(txID, {from: vault});

    // check changed admin
    assert.equal(await coinInstance.getAdmin({from:vault}), signer);
  });

  it("change vault", async () => {
    // setting for testing change admin
    const contractOwner = walletInstance.address;
    await coinInstance.setOwner(contractOwner, {from: vault});
    assert.equal(contractOwner, await coinInstance.getOwner({from: vault}));
    //await web3.eth.sendTransaction({from: user1, to:contractOwner, value: web3.toWei(2, 'ether')});

    // change vault request
    let trSubmit = await walletInstance.requestVaultChange(signer, "vault change to signer", {from: signer});
    let txID = getEventParameterFromTx( trSubmit, "VaultChangeRequested", "id" );
    await walletInstance.signTX(txID, {from: vault});

    // check changed vault
    assert.equal(await coinInstance.getVault({from:admin}), signer);
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
      assertRevert("signer1",() => walletInstance.requestTransferInNews(user1, 1, 0, "test addsigner-1", {from: user1}));
      assertRevert("signer2",() => walletInstance.requestTransferInMinunit(user1, 1, "test addsigner-2", {from: user1}));
      assertRevert("signer3",() => walletInstance.requestSignerAdd(user2, "test addsigner-3", {from: user1}));
      assertRevert("signer4",() => walletInstance.requestSignerRemove(vault, "test addsigner-4", {from: user1}));
      assertRevert("signer5",() => walletInstance.requestAdminChange(user2, "test addsigner-5", {from: user1}));
      assertRevert("signer6",() => walletInstance.requestVaultChange(user2, "test addsigner-6", {from: user1}));
      assertRevert("signer7",() => walletInstance.requestOwnerChange(user2, "test addsigner-7", {from: user1}));
  });
});
