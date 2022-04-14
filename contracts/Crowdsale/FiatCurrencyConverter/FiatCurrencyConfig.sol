pragma solidity 0.5.0;


/** 
  @title FiatCurrencyConfig
  @dev Contract that holds the config constants.
    This contract was separated to keep the cleaness of the
    other contracts and to be able to see the configuration
    constants before deploying the main contracts of this 
    dapp. This is specially useful for testing purposes  
*/
contract FiatCurrencyConfig {

  uint256 constant public USD_PRECISION = 10 ** 18;

}