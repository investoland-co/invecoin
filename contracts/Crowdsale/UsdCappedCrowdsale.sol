pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/crowdsale/emission/MintedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/WhitelistCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/PausableCrowdsale.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "./FiatCurrencyConverter/FiatCurrencyConverter.sol";
import "../InveCoin/InveCoin.sol";


/**
  @title USD-Capped crowdsale
  @dev Crowdsale capped by the amount of dollars raised in raised.
  Note that every usd mentioned in this contract has a precision
  defined in PRECISION, so the functions usually return in dollars with the precision specified above.
  This is a whitelisted, timed crowdsale, capped in USD that mints the tokens to give it to the beneficiary.
  The price of each token growths as the funds raised growth but there are discounts by amount
  The raised amount is the sum of the usdAmount raised in each purchase; so a conversion is made in each purchase.
  
  *This is an abstract contract because the price of each token is not defined here and it is left to be defined by 
  the sub-contract*   
*/
contract UsdCappedCrowdsale is FiatCurrencyConverter, Crowdsale {
  
  using SafeMath for uint256;

  uint256 private _fundingCapInUsd;
  uint256 private _crowdsaleRaisedInUsd;

  constructor(
    uint256 fundingCapInUsd,
    address payable wallet,
    IERC20 token,
    IUsdEthFeeder usdEthFeeder)
    Crowdsale(1, wallet, token) // 1 is just an unused placeholder
    FiatCurrencyConverter(usdEthFeeder)
    public
  {
    _fundingCapInUsd = fundingCapInUsd;
    _crowdsaleRaisedInUsd = 0;
  }

  /**
    @dev Determines if the funding cap has been reached. This cap is considered reached if 
    it cannot be bought at least one token.
    @return capReached Bool
  */
  function capReached() public view returns (bool) {
    return totalRaisedInUsd().add(priceOfNextTokenInUsd()) > _fundingCapInUsd;
  }

  /**
    @dev Funds raised in the crowdsale
    @return totalRaisedInUsd Value in USD * PRECISION
  */
  function totalRaisedInUsd() public view returns (uint256) {
    return _crowdsaleRaisedInUsd;
  }

  /**
    @dev Max amount of dollars to be raised
    @return totalRaisedInUsd Value in USD * PRECISION
  */
  function fundingCapInUsd() public view returns (uint256) {
    return _fundingCapInUsd;
  }

  /**
    @dev Calculates the amount of USD, with the precision used in the contract, that the ussr
    has to pay to buy a token in that moment
    @return priceOfNextTokenInUsd
  */
  function priceOfNextTokenInUsd() public view returns (uint256);

  /**
    @dev Procedure that checks that the tx, a priori, can be executed correctly. Might throw
    revert
  */
  function _preValidatePurchase(address beneficiary, uint256 weiAmount) internal view {
    require(
      totalRaisedInUsd().add(weiToUsd(weiAmount)) <= _fundingCapInUsd,
      "The cap will be surpassed");
    super._preValidatePurchase(beneficiary, weiAmount);
  }

  /**
    @dev Updates the crowdsale raised amount
    @param beneficiary User who will get the tokens
    @param weiAmount Amount paid in weis
  */
  function _updatePurchasingState(address beneficiary, uint256 weiAmount) internal {
    _crowdsaleRaisedInUsd = _crowdsaleRaisedInUsd.add(weiToUsd(weiAmount));

    super._updatePurchasingState(beneficiary, weiAmount);
  }  
}
