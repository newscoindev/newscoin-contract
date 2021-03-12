"use strict"

var NewsCoin = artifacts.require("./NewsCoin.sol");
const theBN = require("bn.js")

/**
 * NewsCoin contract tests 2
 */
contract('NewsCoin2', function(accounts) {
  const BIG = (v) => new theBN.BN(v)

  const owner = accounts[0];
  const admin = accounts[1];
  const vault = accounts[2];
  const minter = accounts[0];

  const user1 = accounts[4];
  const user2 = accounts[5];
  const user3 = accounts[6];
  const user4 = accounts[7];
  const user5 = accounts[8];

  let coin, OneNewsCoinInMinunit, NoOfTokens, NoOfTokensInMinunit;

  const bnBalanceOf = async addr => await coin.balanceOf(addr);
  const bnReserveOf = async addr => await coin.reserveOf(addr);
  const bnAllowanceOf = async (owner, spender) => await coin.allowance(owner, spender);

  const balanceOf = async addr => (await coin.balanceOf(addr)).toString();
  const reserveOf = async addr => (await coin.reserveOf(addr)).toString();
  const allowanceOf = async (owner, spender) => (await coin.allowance(owner,spender)).toString();


  before(async () => {
    coin = await NewsCoin.deployed();
    NoOfTokensInMinunit = await coin.totalSupply();
    OneNewsCoinInMinunit = await coin.getOneNewsCoin();
    NoOfTokens = NoOfTokensInMinunit.div(OneNewsCoinInMinunit)
  });

  const clearUser = async user => {
    await coin.setReserve(user, 0, {from: admin});
    await coin.transfer(vault, await bnBalanceOf(user), {from: user});
  };

  beforeEach(async () => {
    await clearUser(user1);
    await clearUser(user2);
    await clearUser(user3);
    await clearUser(user4);
    await clearUser(user5);
  });

  it("reserve and then approve", async() => {
    assert.equal(await balanceOf(user4), "0");

    const OneNewsTimesTwoInMinunit = OneNewsCoinInMinunit.mul(BIG(2))
    const OneNewsTimesTwoInMinunitStr = OneNewsTimesTwoInMinunit.toString()

    const OneNewsTimesOneInMinunit = OneNewsCoinInMinunit.mul(BIG(1))
    const OneNewsTimesOneInMinunitStr = OneNewsTimesOneInMinunit.toString()

    // send 2 News to user4 and set 1 News reserve
    coin.transfer(user4, OneNewsTimesTwoInMinunit, {from: vault});
    coin.setReserve(user4, OneNewsCoinInMinunit, {from: admin});
    assert.equal(await balanceOf(user4), OneNewsTimesTwoInMinunitStr);
    assert.equal(await reserveOf(user4), OneNewsCoinInMinunit.toString());

    // approve 2 News to user5
    await coin.approve(user5, OneNewsTimesTwoInMinunit, {from:user4});
    assert.equal(await allowanceOf(user4, user5), OneNewsTimesTwoInMinunitStr);

    // transfer 2 News from user4 to user5 SHOULD NOT BE POSSIBLE
    try {
      await coin.transferFrom(user4, user5, OneNewsTimesTwoInMinunit, {from: user5});
      assert.fail();
    } catch(exception) {
      assert.isTrue(exception.message.includes("revert"));
    }

    // transfer 1 News from user4 to user5 SHOULD BE POSSIBLE
    await coin.transferFrom(user4, user5, OneNewsTimesOneInMinunit, {from: user5});
    assert.equal(await balanceOf(user4), OneNewsTimesOneInMinunitStr);
    assert.equal(await reserveOf(user4), OneNewsTimesOneInMinunitStr); // reserve will not change
    assert.equal(await allowanceOf(user4, user5), OneNewsTimesOneInMinunitStr); // allowance will be reduced
    assert.equal(await balanceOf(user5), OneNewsTimesOneInMinunitStr);
    assert.equal(await reserveOf(user5), "0");

    // transfer .5 News from user4 to user5 SHOULD NOT BE POSSIBLE if balance <= reserve
    const halfNewsInMinunit = OneNewsCoinInMinunit.div(BIG(2));
    try {
      await coin.transferFrom(user4, user5, halfNewsInMinunit, {from: user5});
      assert.fail();
    } catch(exception) {
      assert.isTrue(exception.message.includes("revert"));
    }
  })

  it("only minter can call mint", async() => {
      const OneNewsTimesTenInMinunit = OneNewsCoinInMinunit.mul(BIG(10))
      const OneNewsTimesTenInMinunitStr = OneNewsTimesTenInMinunit.toString()

      assert.equal(await balanceOf(user4), "0");

      await coin.mint(user4, OneNewsTimesTenInMinunit, {from: minter})

      const totalSupplyAfterMintStr = (await coin.totalSupply()).toString()
      assert.equal(totalSupplyAfterMintStr, OneNewsTimesTenInMinunit.add(NoOfTokensInMinunit).toString())
      assert.equal(await balanceOf(user4), OneNewsTimesTenInMinunitStr);

      try {
          await coin.mint(user4, OneNewsTimesTenInMinunit, {from: user4})
          assert.fail();
      } catch(exception) {
          assert.equal(totalSupplyAfterMintStr, OneNewsTimesTenInMinunit.add(NoOfTokensInMinunit).toString())
          assert.isTrue(exception.message.includes("revert"));
      }
  })

  it("cannot mint above the mint cap", async() => {
      const OneNewsTimes100BilInMinunit = 
              OneNewsCoinInMinunit.mul(BIG(100000000000))

      assert.equal(await balanceOf(user4), "0");


      try {
          await coin.mint(user4, OneNewsTimes100BilInMinunit, {from: minter})
          assert.fail();
      } catch(exception) {
          assert.isTrue(exception.message.includes("revert"));
      }
  })
});
