pragma solidity 0.5.0;
/* solium zeppelin/no-arithmetic-operations */

/** 
  @title Config
  @dev Contract that holds the config constants.
    This contract was separated to keep the cleaness of the
    other contracts and to be able to see the configuration
    constants before deploying the main contracts of this
    dapp. This is specially useful for testing purposes
*/
contract Config {
  // Modifications over this values should carefully review.
  uint256 constant public PRECISION = 10 ** 18;
  uint256 constant SCALING_FACTOR_PRICE = 2.7 * 10 ** 12; // 0.0000027 * PRECISION
  uint256 constant INDEPENDENT_TERM_PRICE = 3 * PRECISION; // 3 * PRECISION
  uint256 constant LN_CUSTOM_BASE_PRICE = 1098612288668109691; // ln(3) * PRECISION
}