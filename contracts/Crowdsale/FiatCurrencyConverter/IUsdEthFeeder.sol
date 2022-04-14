pragma solidity 0.5.0;

/**
 * @title USD-ETH Feeder interface
 * @dev IUSDETHFeeder An interface that defines how a USD-ETH Feeder shoul be called
 */
interface IUsdEthFeeder {
    /** 
    @dev Function  that returns the ETH-USD Ratio
    @return rate Number of Weis equivalent to a full dollar 
    */
    function read() external view returns (uint256);
}
