pragma solidity 0.5.0;
import "./FiatCurrencyConverter/IUsdEthFeeder.sol";

/**
 * @title Mock Wallet 
 * @dev IUSDETHFeeder An interface that defines how a USD-ETH Feeder shoul be called
 */
contract MockWallet {
  /** 
    @dev Function  that returns the ETH-USD Ratio
    @return rate Number of Weis equivalent to a full dollar 
  */
  function () external payable {

  }

  /** 
    @dev Function that returns the balance of itself
    @return myBalance 
  */
  function getBalance() public view returns (uint256) {
    return address(this).balance;
  }
}
