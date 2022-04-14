pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../../ExternalLibs/Oraclize.sol";
import "./IUsdEthFeeder.sol";

/**
  @title OraclizePriceFeeder
  @dev Contract meant to be used in the inveCoin crowdsale.
  Developed using the example give by oraclize 
  This contracts queries an HTTP/S API to get the convertion rate between USD
  and the Cryptocurrency of use. Everywehere in this contract we use the abstraction
  wei but it can be 10 ** -18 of RBTC too.
 */
contract OraclizePriceFeeder is IUsdEthFeeder, usingOraclize {

  using SafeMath for uint256;
  uint256 private _weisInADollar;

  uint256 constant WEIS_IN_AN_ETHER = 1 ether;
  uint256 constant REFRESH_INTERVAL = 1 hours;
  bytes1 constant ZERO_IN_ASCII = bytes1(uint8(48));
  bytes1 constant NINE_IN_ASCII = bytes1(uint8(57));
  bool waitingForOraclize;

  string priceEndpoint = "json(https://api.pro.coinbase.com/products/ETH-USD/ticker).price";

  event PriceUpdated(uint256 weisInADollar);

  /**
    @dev Function that must be implemente in order to give oraclize
    the possibility to input the requested data
    @param myid Id defined only because oraclize needs it
    @param result ETHUSD price
  */
  /* solium-disable-next-line */
  function __callback(bytes32 myid, string memory result) public {
    require(msg.sender == oraclize_cbAddress(), "Caller was not oraclize recognized address");
    _weisInADollar = parsePrice(result);
    emit PriceUpdated(_weisInADollar);
    waitingForOraclize = false;
    updatePrice();
  }

  /**
    @dev Start a chain of refreshes that happens every hour
    If there is not enough balance to pay for the service the chain
    is broken and the function has to be called again externally by
    a paying user to restart the refreshing process.
  */
  function updatePrice() public payable {
    if (oraclize_getPrice("URL") <= address(this).balance && ! waitingForOraclize) {
      bytes32 queryId = oraclize_query(REFRESH_INTERVAL, "URL", priceEndpoint);
      if (queryId != 0) {
        waitingForOraclize = true;
      }
    }
  }

  /** 
    @dev Returns the amount of weis in a single dollar 
   */
  function read() public view returns (uint256) {
    return _weisInADollar;
  }


  /**
    @dev Given a string which can be the representation of either a float or an int
    which is the amount of dollars in an ether and returns the amount of WEIS in a 
    single dollar. i.e., parses the number, and then computes the inverse of it times
    the amount of weis in an ether. 
    Function inspired from here
    https://ethereum.stackexchange.com/questions/10932/how-to-convert-string-to-int
    @return weisInADollar Returns the amount of weis equivalent to a single dollar

   */
  function parsePrice(string memory dollarsInAEtherFloat) public pure returns (uint256) {
    bytes memory b = bytes(dollarsInAEtherFloat);
    uint256 result = 0;
    uint256 decimalPlaces = 0;
    for (uint256 i = 0; i < b.length; i++) { // c = b[i] was not needed
      if (b[i] == ".") {
        decimalPlaces = b.length.sub(i).sub(uint256(1));
      }
      if (b[i] >= ZERO_IN_ASCII && b[i] <= NINE_IN_ASCII) {
        result = result.mul(10).add(uint8(b[i])).sub(uint8(ZERO_IN_ASCII));
      }
    }
    uint256 precision = 10 ** decimalPlaces;
    // Result here is [DOLLARS * PRECISION / ETH ]

    // [WEI / ETH] * [PRECISION] / [DOLLARS * PRECISION / ETH] =  [WEI / DOLLAR]
    return  WEIS_IN_AN_ETHER.mul(precision).div(result);
  }
} 