pragma solidity 0.5.0;

import "./Ownable.sol";
import "./ERC20Vesting.sol";

/**
  @title ERC20VestingCrowdsale
  @dev ERC20 that supports vesting and the tokens generation can be done through a crowdsale
    Note that when the crowdsale finishes the emission of tokens stops completely.
 */
contract ERC20VestingCrowdsale is ERC20Vesting, Ownable {

  bool private _crowdsaleHasFinished;
  bool private _crowdsaleWasSet;
  address private _crowdsale;
  event CrowdsaleFinished();
  event CrowdsaleSet(address crowdsale);

  constructor (uint256 presaleVestingTimestamp, uint256 crowdsaleVestingTimestamp) ERC20Vesting(presaleVestingTimestamp, crowdsaleVestingTimestamp) public {
    _crowdsaleHasFinished = false;
    _crowdsale = address(0); 
  }

  modifier whenCrowdsaleNotSet() {
    require(_crowdsale == address(0), "Crowdsale already set");
    _;
  }

  modifier whenCrowdsaleSet() {
    require(_crowdsale != address(0), "Crowdsale not set yet");
    _;
  }

  modifier whenCrowdsaleNotFinished() {
    require(!hasCrowdsaleFinished(), "Crowdsale has finished already");
    _;
  }

  modifier isCrowdsale() {
    require(msg.sender == address(_crowdsale), "Sender is not set crowdsale");
    _;
  }

  function hasCrowdsaleFinished() public view returns (bool) {
    return _crowdsaleHasFinished;
  }

  /**
    @dev Finishes the crowdsale and starts vesting.
    Can be executed only once, and after the crowdsale finishes.
   */
  
  function finishCrowdsale() public whenCrowdsaleNotFinished isCrowdsale {
    _crowdsaleHasFinished = true;
    emit CrowdsaleFinished();
  }

  /**
    @dev Generate new tokens. Crowdsale has to be active
    @param to The address Which will receive the tokens
    @param value Amount of tokens to generate

   */
  function mint(address to, uint256 value) public returns (bool) {
    return super.mint(to, value);
  }

  /**
    @dev Tells the token the address of the crowdsale contract in order to make it
    able to mint an pause/unpause the token
    @param crowdsale Address of the crowdsale contract
   */
  function setCrowdsale(address crowdsale) public onlyOwner whenCrowdsaleNotSet  {
    require(crowdsale != address(0), "Invalid crowdsale");
    addMinter(crowdsale);
    _crowdsale = crowdsale;
    emit CrowdsaleSet(crowdsale);
  } 

  function addVesting(
    address user,
    uint256 amount,
    uint256 monthsToStart,
    uint256 monthsToFinish,
    bool immediate,
    bool presale)
  public {
    super.addVesting(user, amount, monthsToStart, monthsToFinish, immediate, presale);
  }
}
