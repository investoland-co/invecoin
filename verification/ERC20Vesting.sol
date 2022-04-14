pragma solidity 0.5.0;

import "./SafeMath.sol";
import "./ERC20Mintable.sol";
import "./Math.sol";

/**
  @title ERC20Vesting
  @dev ERC20 that supports vested tokens. Vesting: https://www.investopedia.com/terms/v/vesting.asp.
    The vesting is done from the same start date for every address.
    Only one lot of vested tokens is supported for a given address.

    Note that the vesteable tokens cannot be added after the contract has started vesting.
 */
contract ERC20Vesting is ERC20Mintable {

  using SafeMath for uint256;

  struct Vesting {
    uint256 vesteableTokens;
    uint256 claimedTokens;
    uint256 monthsToStart;
    uint256 monthsToFinish;
    bool immediate;
    bool presale;
  }

  mapping (address => Vesting) public vestings;

  uint256 private _crowdsaleVestingTimestamp; // Maximum date
  uint256 private _presaleVestingTimestamp;
  uint256 private _monthToSeconds = 30 days; // 30 * 60 * 60 * 24

  uint256 private _tokensInVestingState = 0;

  event TokensClaimed(address indexed user, uint256 amount);
  event VestingTokensAdded(
    address indexed user,
    uint256 amount,
    uint256 monthsToStart,
    uint256 monthsToEnd
  );
  modifier whenVestingStartedForSender() {
    require(
      vestingStartDateForUser(msg.sender) <= now,
      "User start vesting date has not been reached yet"
    );
    _;
  }

  constructor(uint256 presaleVestingTimestamp, uint256 crowdsaleVestingTimestamp) public {
    require(presaleVestingTimestamp > 0, "presale start vesting timestamp cannot be 0");
    _presaleVestingTimestamp = presaleVestingTimestamp;
    _crowdsaleVestingTimestamp = crowdsaleVestingTimestamp;
  }

  /**
    @dev Calculates the total supply
    @return totalSupply Amount of tokens that are owned or will be owned by users in the future, i.e.
    amount of tokens owned by users plus amount of tokens that are in a vesting state
  */ 
  function totalSupply() public view returns (uint256) {
    return super.totalSupply().add(_tokensInVestingState);
  }

  /**
    @dev Returns the circulating supply
    @return circulatingSupply Amount of tokens that are owned by users now
  */
  function circulatingSupply() public view returns (uint256) {
    return super.totalSupply();
  }

  /**
    @dev Amount of tokens in a vesting state(doesn't include claimed tokes)
    @return _tokensInVestingState
   */
  function vestingSupply() public view returns (uint256) {
    return _tokensInVestingState;
  }

  /**
    @dev Amount of tokens that the user will be able to claim in the future
    @param user Address who has the vesting tokens
    @return vestingTokens
   */
  function vestingBalanceOf(address user) public view returns (uint256) {
    Vesting storage vesting = vestings[user];
    return vesting.vesteableTokens.sub(vesting.claimedTokens);
  }

  /**
    @dev Lets the user claims the tokens he has already vested. Reverts if the 
    user doesnt have any tokens to vest.
  **/
  function claim() public whenVestingStartedForSender {
    Vesting storage vesting = vestings[msg.sender];

    uint256 vestedTokens = _vestedTokens(msg.sender);

    uint256 claimableTokens = vestedTokens.sub(vesting.claimedTokens);

    require(claimableTokens > 0, "The user has claimed all the tokens he can claim for now");

    vesting.claimedTokens = vesting.claimedTokens.add(claimableTokens);

    _mint(msg.sender, claimableTokens);

    _tokensInVestingState = _tokensInVestingState.sub(claimableTokens);

    emit TokensClaimed(msg.sender, claimableTokens);
  }

  /**
    @dev Adds vesteable tokens in batch
    @notice This MUST be only used to add presale vestings
    @param newUsers Array of addresses that will have vesteable tokens
    @param amounts Array that tells how much tokens will the address with the same index
    will have. Should be strictly greater than 0
    @param monthsToStart Amounts of months that the user has to wait to make the first claim
    @param monthsToFinish Amounts of months that the user has to wait to claim the tokens completely
  **/
  function addVestingBatch (
    address[] memory newUsers,
    uint256[] memory amounts,
    uint256[] memory monthsToStart,
    uint256[] memory monthsToFinish
  ) public onlyMinter {
    require(
      newUsers.length == amounts.length && 
      newUsers.length == monthsToStart.length && 
      newUsers.length == monthsToFinish.length,
      "Arrays length mismatch");

    for (uint256 i = 0; i < newUsers.length; i ++) {
      addVesting(newUsers[i], amounts[i], monthsToStart[i], monthsToFinish[i], false, true);
    }
  }

  /**
    @dev Adds vesteable tokens.
    @param user Address that will have vesteable tokens.
    @param amount Amount of tokens that the address will be able to claim in total.
    @param monthsToStart Amount of months that the user has to wait to make the first claim.
    @param monthsToFinish Amount of months that the user has to wait to claim the tokens completely.
    @param immediate true to allow tokens to be claimed after crowdsale is finished, false otherwise. 
  **/
  function addVesting(
    address user,
    uint256 amount,
    uint256 monthsToStart,
    uint256 monthsToFinish,
    bool immediate,
    bool presale)
  public onlyMinter {
    require(amount > 0, "No tokens to vest");
    require(monthsToStart < monthsToFinish, "No time to vest");

    require(user != address(0), "user address must not be zero");

    uint256 finalAmount = 0;

    Vesting memory currentVesting = vestings[user];

    if (currentVesting.monthsToStart > 0 && currentVesting.monthsToFinish > 0) {
      // adding more tokens to current vesting
      require(currentVesting.monthsToStart == monthsToStart, "months to start must equal to the current vesting");
      require(currentVesting.monthsToFinish == monthsToFinish, "months to finish must equal to the current vesting");
      require(currentVesting.immediate == immediate, "immediate must equal to the current vesting");
      require(currentVesting.presale == presale, "presale must equal to the current vesting");
      finalAmount = amount.add(currentVesting.vesteableTokens);
    } else {
      // new vesting!
      finalAmount = amount;
    }

    vestings[user] = Vesting(finalAmount, 0, monthsToStart, monthsToFinish, immediate, presale);
    _tokensInVestingState = _tokensInVestingState.add(amount);

    emit VestingTokensAdded(user, amount, monthsToStart, monthsToFinish);
  }

  function vestingStartDateForUser(address user) public view returns(uint256){
    return vestings[user].presale ? _presaleVestingTimestamp : _crowdsaleVestingTimestamp;
  }

  /**
    @dev Counts how many tokens the user should have vested until now ideally and
    rounds down that number.
    @param user Address that have the tokens associated
    @return Amounts of vested tokens rounded down.
  */
  function _vestedTokens(address user) internal view returns (uint256){
    Vesting memory vesting = vestings[user];
    uint256 vestedTokens = 0;

    require(vesting.vesteableTokens > 0, "User has not vesteable tokens");
    if (vesting.immediate) {
      vestedTokens = vesting.vesteableTokens;
    } else {
      uint256 startVestingTimestamp = vestingStartDateForUser(user);
      
      require(
        now >= startVestingTimestamp.add(vesting.monthsToStart.mul(_monthToSeconds)),
        "Has not reached vesting start date"
      );

      uint256 elapsedVestingTime = now.sub(startVestingTimestamp.add(
        vesting.monthsToStart.mul(_monthToSeconds)
      ));

      uint256 vestingMonths = vesting.monthsToFinish.sub(vesting.monthsToStart);

      uint256 vestedTokensWithoutCap = vesting.vesteableTokens.mul(
        elapsedVestingTime).div(vestingMonths).div(_monthToSeconds);

      vestedTokens = Math.min(vestedTokensWithoutCap, vesting.vesteableTokens);
    }

    return vestedTokens;
  }

}
