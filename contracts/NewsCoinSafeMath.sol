pragma solidity >=0.5.0;

/**
 * @title SafeMath
 * @dev Math operations with safety checks that throw on error
 */
library NewsCoinSafeMath {
    function sub(uint8 a, uint8 b) internal pure returns (uint8) {
        assert(b <= a);
        return a - b;
    }

}
