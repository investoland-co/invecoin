pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/WhitelistCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "./UsdCappedCrowdsale.sol";
import "../InveCoin/InveCoin.sol";
import "../FixedPointMath.sol";


/**
  @title InveCoin crowdsale contract
  @dev Crowdsale of the invecoin. Note that every usd mentioned in this contract has a precision
  defined in PRECISION, so the functions usually return in dollars with the precision specified above.
  This is a whitelisted, timed crowdsale, capped in USD that mints the tokens to give it to the beneficiary.
  The price of each token growths as the funds raised growth but there are discounts by amount   
*/
contract InveCrowdsale is
  WhitelistCrowdsale,
  TimedCrowdsale,
  UsdCappedCrowdsale {

  using SafeMath for uint256;

  struct DiscountRow {
    uint256 usdThreshold;
    uint256 value; // Value is a percentage if discountIsPercentage; else it is a fixedPrice
    bool discountIsPercentage;
    uint256 monthsToStartVesting;
    uint256 monthsToEndVesting;
  }

  struct CompanyDistribution {
    address receiver;
    uint percentage;
    uint monthsToStart;
    uint monthsToEnd;
  }

  uint256 private _raisedInPresaleInUsd;
  uint8 private _companyPercentage;
  DiscountRow[] private _discounts;
  address private _companyAddress;

  CompanyDistribution[] private _companyDistributions;

  event CrowdsaleFinished(uint256 tokensDistributed);
  
  event DiscountAdded(
    uint256 usdThreshold,
    uint256 value,
    bool discountIsPercentage,
    uint256 monthsToStartVesting,
    uint256 monthsToEndVesting
  );

  event TokensDelivered(
    uint256 weiSent,
    uint256 tokenAmount,
    uint256 discountValueUsed,
    bool discountIsPercentage,
    uint256 monthsToStartVesting,
    uint256 monthsToEndVesting
  );

  /**
    @dev Crowdsale of the invecoin. Note that every usd mentioned in this contract has a precision
    defined in PRECISION, so the functions usually return in dollars with the precision specified above
    @param fundingCapInUsd The max amount that can be raised accounting the crowdsale and 
    the pre-sales. IMPORTANT: This value is in dollars * PRECISION
    @param raisedInPresaleInUsd How many dollars were raised in the presales stage.
    IMPORTANT: This value is in dollars * PRECISION
    @param wallet The address where every payment will be forwarded
    @param token The contract with the tokens we are selling
    @param openingTime Since when the users will be able to buy through this contract
    @param closingTime Until when the users will be able to buy through this contract
    @param discountThresholds Array of amounts in PRECISION dollars that the user has to pay
    as a minimum to have that discount
    @param values Array of values that can be a percentage or a usdWithPrecision fixed price
    @param discountIsPercentage Array of bools that indicate if the discount must be applied as a percentage
    or as a fixedPrice
    @param monthsToStartVesting Array of amount of months that the user has to wait to start claiming
    his points
    @param monthsToEndVesting Array of amount of months that the user has to wait to claim all the
    tokens he bought 
    @param companyPercentage Percentage of tokens that the company will have at the end of the crowdsale
  */
  constructor(
    uint256 fundingCapInUsd,
    uint256 raisedInPresaleInUsd,
    IUsdEthFeeder usdEthFeeder,
    address payable wallet,
    IERC20 token,
    uint256 openingTime,
    uint256 closingTime,
    uint256[] memory discountThresholds,
    uint256[] memory values,
    bool[] memory discountIsPercentage, 
    uint256[] memory monthsToStartVesting,
    uint256[] memory monthsToEndVesting,
    uint8 companyPercentage)
    TimedCrowdsale(openingTime, closingTime)
    UsdCappedCrowdsale(fundingCapInUsd, wallet, token, usdEthFeeder)
    public
  {
    require(
      fundingCapInUsd > raisedInPresaleInUsd,
      "Raised in presale already reached the fund cap");
    _raisedInPresaleInUsd = raisedInPresaleInUsd;
    _companyPercentage = companyPercentage;

    initializeDiscounts(
      discountThresholds,
      values,
      discountIsPercentage,
      monthsToStartVesting,
      monthsToEndVesting);
  }

  /**
    @dev Calculates the amount of USD, with the precision used in the contract, that the user
    has to pay to buy a token in that moment
    @return priceOfNextTokenInUsd
  */
  function priceOfNextTokenInUsd() public view returns (uint256){
    return tokenPriceInUsd(crowdsaleRaisedInUsd());
  }

  /**
    @dev Calculates APPROXIMATELY the amount of wei that the user
    has to pay to buy a token in that moment
    NOTE: This is a helper function and should not be trusted completely because it is not guaranteed
    that if you take the result and you apply weiToUsd() it probably wont be equal to priceOfNextTokenInUsd.
    So instead of sending this amount of wei, send and amount x for which weiToUsd(x) >= priceOfNextTokenInUsd()
    @return priceOfNextTokenInWei 
  */
  function priceOfNextTokenInWei() public view returns (uint256){
    return usdToWei(priceOfNextTokenInUsd());
  }

  /**
    @dev Determines if more tokens can be purchased or not. To be more clear, if the
    crowdsale has finished then noone can buy more tokens
    @return crowdsaleHasFinished
  */
  function crowdsaleHasFinished() public view returns (bool){
    return hasClosed() || capReached();
  }

  /**
    @dev Sets the addresses in which the company's cut will be distributed
    @notice The way to properly mark a vesting to be immediately ready after crowd sale is over
      is using 0 as starting month and any integer value above 0 for the end month.
      This is due to a restriction on the addVesting function, which requires startMonth < endMonth.
      This could be avoided if we allowed the month values to be also equal.
    @param addresses Array of addresses that will have vesteable tokens
    @param percentages Array that tells how much tokens will the address with the same index
      will have. Should be strictly greater than 0
    @param monthsToStart Amounts of months that the user has to wait to make the first claim
    @param monthsToFinish Amounts of months that the user has to wait to claim the tokens completely
  **/
  function setDistributionAddresses(
    address[] memory addresses,
    uint256[] memory percentages,
    uint256[] memory monthsToStart,
    uint256[] memory monthsToFinish
  ) public onlyOwner {
    require(_companyDistributions.length == 0, "company distributions are already set");
    require(addresses.length > 0, "provide at least one address to distribute the company tokens");
    require(
      addresses.length == percentages.length &&
      addresses.length == monthsToStart.length &&
      addresses.length == monthsToFinish.length,
      "Arrays length mismatch");
    uint distribution = 0;
    uint256 i = 0;
    for (i = 0; i < addresses.length; i ++) {
      require(addresses[i] != address(0), "company address cannot be zero");
      require(monthsToStart[i] < monthsToFinish[i], "invalid vesting time");
      distribution = distribution.add(percentages[i]);
    }
    require(distribution == 100, "you have to distribute all the company tokens");
    for (i = 0; i < addresses.length; i ++) {
      _companyDistributions.push(
        CompanyDistribution(addresses[i], percentages[i], monthsToStart[i], monthsToFinish[i])
      );
    }
  }

  /**
    @dev Notify token ERC20 that the crowdsale finished, and distribute partners/
    team tokens
  */
  function finish() public {
    require(crowdsaleHasFinished(), "Crowdsale has not finished yet");

    uint256 tokensToDistribute = token().totalSupply()
      .mul(_companyPercentage)
      .div(uint256(100).sub(_companyPercentage));

    require(
      _companyDistributions.length > 0,
      "set the company distributions addresses before finish the crowdsale"
    );

    for (uint256 i = 0; i < _companyDistributions.length; i ++) {
      CompanyDistribution memory distribution = _companyDistributions[i];

      uint256 tokens = tokensToDistribute.mul(distribution.percentage).div(uint256(100));

      if (tokens > 0 ) {
        bool immediate = false;
        if (distribution.monthsToStart == 0 && distribution.monthsToEnd == 1) {
          immediate = true;
        }
        InveCoin(address(token())).addVesting(
          distribution.receiver,
          tokens,
          distribution.monthsToStart,
          distribution.monthsToEnd,
          immediate,
          false
        );
      }
    }
    InveCoin(address(token())).finishCrowdsale();
    emit CrowdsaleFinished(tokensToDistribute);
  }

  /**
    @dev Funds raised in the crowdsale and in the presale
    @return totalRaisedInUsd Value in USD * PRECISION
  */
  function totalRaisedInUsd() public view returns (uint256) {
    return crowdsaleRaisedInUsd().add(_raisedInPresaleInUsd);
  }
  
  /**
    @dev Procedure that checks that the tx, a priori, can be executed correctly. Might throw
    revert
  */
  function _preValidatePurchase(address beneficiary, uint256 weiAmount) internal view {
    require(!crowdsaleHasFinished(), "Crowdsale has finished already");
    super._preValidatePurchase(beneficiary, weiAmount);
  }
  
  /**
    @dev Returns the maximum amount of tokens that can be purchased given the amount paid 
    @param weiSent Amount paid in weis
    @return Amount of tokens bought [precision in use]
  */
  function _getTokenAmount(uint256 weiSent) internal view returns (uint256) {
    uint256 contributionInUsd = weiToUsd(weiSent);
    uint256 pricePerToken;

    DiscountRow storage correspondingDiscount = _getDiscountRow(weiSent);

    if (correspondingDiscount.discountIsPercentage) {
      pricePerToken = getTokenPriceWithDiscountInUsd(
        Math.average(crowdsaleRaisedInUsd().add(contributionInUsd), crowdsaleRaisedInUsd()),
        correspondingDiscount.value);
    } else {

      pricePerToken = correspondingDiscount.value;
    }
    return FixedPointMath.div(contributionInUsd, pricePerToken, PRECISION);
  } 

  /**
    @dev Price of a token at any time in the crowdsale in usd with a percentage discount applied
    @param raisedInCrowdsale Amount of USD * PRECISION raised
    in the crowdsale
    @param discountPercentage Percentage of discount
    @return Price of token with the given that the crowdsale raised
    amount is the one passed as a param in weis
  */
  function getTokenPriceWithDiscountInUsd(
    uint256 raisedInCrowdsale,
    uint256 discountPercentage)
    internal view returns (uint256){
    uint256 futureTokenPriceInUsd = tokenPriceInUsd(raisedInCrowdsale);
    return futureTokenPriceInUsd.mul(uint256(100).sub(discountPercentage)).div(100);
  }

  /**
    @dev Price of a token at any time in the crowdsale in usd
    @param crowdsaleRaisedInUsd Amount of USD * PRECISION raised
    in the crowdsale
    @return Price of token with the given that the crowdsale raised
    amount is the one passed as a param in USD * PRECISION
  */
  function tokenPriceInUsd(uint256 crowdsaleRaisedInUsd) internal view returns (uint256){
    return logCustomBase(linearFn(crowdsaleRaisedInUsd));
  }


  function linearFn(uint256 crowdsaleRaisedInUsd) internal pure returns (uint256) {
    uint256 linearTerm = FixedPointMath.mul(
      SCALING_FACTOR_PRICE,
      crowdsaleRaisedInUsd,
      PRECISION
    );
    return linearTerm.add(INDEPENDENT_TERM_PRICE);
  }

  function logCustomBase(uint256 x) internal pure returns (uint256) {
    uint256 lnX = FixedPointMath.ln(x, PRECISION);
    
    // Based on the identity log_b (x) = ln (x) / ln(b) 
    return FixedPointMath.div(lnX, LN_CUSTOM_BASE_PRICE, PRECISION);
  }


  /**
    * @dev This fuction overrides the one taken from the OZ MintedCrowdsale contract.
    * Here we have to use the msg.value because of the impossibility to do the vesting for the 
    * tokens bought with discount only with the params passed to this function.
    * Another option was to override a function OZ asks explicitly not to override
    * (buyTokens) so a trade-off had to be made.
    */

  function _deliverTokens(address beneficiary, uint256 tokenAmount) internal {
    uint256 weiSent = msg.value;
    InveCoin inveCoin = InveCoin(address(token()));

    DiscountRow storage discountToUse = _getDiscountRow(weiSent);
    uint256 discountValue = discountToUse.value;
    bool discountIsPercentage = discountToUse.discountIsPercentage;
    uint256 monthsToStartVesting = discountToUse.monthsToStartVesting;
    uint256 monthsToEndVesting = discountToUse.monthsToEndVesting;

    if (monthsToStartVesting > 0 ) {
      inveCoin.addVesting(beneficiary, tokenAmount, monthsToStartVesting, monthsToEndVesting, false, false);
    } else {
      // ugly hack
      inveCoin.addVesting(beneficiary, tokenAmount, 0, 1, true, false);
    }

    emit TokensDelivered(
      weiSent,
      tokenAmount,
      discountValue,
      discountIsPercentage,
      monthsToStartVesting,
      monthsToEndVesting);
  }

  /**
    @dev Initializes the discount to be used in the purchases. This are passed as equally long
    arrays that each contains a certain parameter of each discount row (discount posibility)
    @param discountThresholds Array of amounts in PRECISION dollars that the user has to pay
    as a minimum to have that discount
    @param values Array of values that can be a percentage or a usdWithPrecision fixed price
    @param discountIsPercentage Array of bools that indicate if the discount must be applied as a percentage
    or as a fixedPrice
    @param monthsToStartVesting Array of amount of months that the user has to wait to start claiming
    his points
    @param monthsToEndVesting Array of amount of months that the user has to wait to claim all the
    tokens he bought 
   */
  function initializeDiscounts(
    uint256[] memory discountThresholds,
    uint256[] memory values,
    bool[] memory discountIsPercentage,
    uint256[] memory monthsToStartVesting,
    uint256[] memory monthsToEndVesting)
    internal {

    require(
      discountThresholds.length == values.length && 
      discountThresholds.length == discountIsPercentage.length && 
      discountThresholds.length == monthsToStartVesting.length && 
      discountThresholds.length == monthsToEndVesting.length,
      "Arrays length mismatch");
    uint256 previousThreshold = 0;
    addDiscountRow(0, 0, true, 0, 0);
    for (uint256 i = 0; i < discountThresholds.length; i ++) {
      require(previousThreshold < discountThresholds[i], "Unordered array");
      require(
        monthsToStartVesting[i] < monthsToEndVesting[i],
        "Invalid discount rule. Vesting duration must be positive");
      require(
        (discountIsPercentage[i] && values[i] > 0) ||
        (!discountIsPercentage[i]),
        "Invalid discount rule. No discount set");
      require(
        (discountIsPercentage[i] && values[i] < 100 ) || 
        (!discountIsPercentage[i] && values[i] > 0 ),
        "Invalid discount rule. Discount too high");
      addDiscountRow(
        discountThresholds[i],
        values[i],
        discountIsPercentage[i],
        monthsToStartVesting[i],
        monthsToEndVesting[i]
      );
      previousThreshold = discountThresholds[i];
    }
  }
  
  /**
    @dev Add only one discount possibility. Also emits an event that it happened
    */
  function addDiscountRow(
    uint256 discountThreshold,
    uint256 value,
    bool discountIsPercentage,
    uint256 monthsToStartVesting,
    uint256 monthsToEndVesting) internal {
    _discounts.push(
      DiscountRow(
        discountThreshold,
        value,
        discountIsPercentage,
        monthsToStartVesting,
        monthsToEndVesting
      )
    );

    emit DiscountAdded(
      discountThreshold,
      value,
      discountIsPercentage,
      monthsToStartVesting,
      monthsToEndVesting);
    
  }

  /**
    @dev Returns which discount should be applied in a purchase of usdAmount
    @param weiAmount Amount of weis paid
    @return correspondingDiscountRow
   */
  function _getDiscountRow(uint256 weiAmount) internal view returns (DiscountRow storage) {
    DiscountRow storage previousDiscount = _discounts[0];
    for (uint256 i = 1; i < _discounts.length; i ++ ) {
      if (weiAmount < usdToWei(_discounts[i].usdThreshold)) {
        return previousDiscount;
      } 

      previousDiscount = _discounts[i];
    }
    return previousDiscount; 
  }

  /**
    @dev Funds raised in the crowdsale
    @return totalRaisedInUsd Value in USD * PRECISION
  */
  function crowdsaleRaisedInUsd() internal view returns (uint256) {
    return super.totalRaisedInUsd();
  }
}
