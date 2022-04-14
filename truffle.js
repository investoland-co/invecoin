const HDWalletProvider = require('truffle-hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // for more about customizing your Truffle configuration!
  solc: {
    optimizer: {
      enabled: true,
      runs: 1000000000,
    },
  },
  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*',
      gas: 6721975,
      gasPrice: 20000000000,
    },
    dev: {
      host: '127.0.0.1',
      port: 8545,
      network_id: "*",
      gas: 4550000,
      gasPrice: 59240000,
      provider: new HDWalletProvider([process.env.WALLET_PKEY], 'http://127.0.0.1:8545/')
    },
    ropsten: {
      provider: new HDWalletProvider(
        process.env.WALLET_PKEY,
        'https://ropsten.infura.io/v3/<token>',
      ),
      network_id: 3,
      gas: 7600000,
    },
    rinkeby: {
      provider: new HDWalletProvider(
        process.env.WALLET_PKEY,
        'https://rinkeby.infura.io/v3/<token>',
      ),
      network_id: 4,
    },
    coverage: {
      host: 'localhost',
      network_id: '*', // eslint-disable-line camelcase
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    },
    rskTestnet: {
      provider: new HDWalletProvider(
        process.env.WALLET_PKEY,
        'https://public-node.testnet.rsk.co/',
      ),
      network_id: '*',
      gasPrice: 70000000,
      gas: 4000000,
      timeoutBlocks: 50
    },
    sesocioMain: {
      provider: new HDWalletProvider(process.env.WALLET_PKEY, 'http://159.203.107.71:4444/'),
      network_id: '*',
      gasPrice: 65164000,
      gasLimit: 6800000,
    },
    bnbMain: {
      provider: new HDWalletProvider(process.env.WALLET_PKEY, 'https://bsc-dataseed4.defibit.io/'),
      network_id: '*',
      gasPrice: 5000000000,
      gasLimit: 10000000,
      timeoutBlocks: 70
    },
    rskMain: {
      provider: new HDWalletProvider(process.env.WALLET_PKEY, 'https://public-node.rsk.co/'),
      network_id: '*',
      gasPrice: 65164000,
      gasLimit: 6800000,
    },
  },
  mocha: {
    useColors: true,
    reporter: 'mochawesome',
  },
};
