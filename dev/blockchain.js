const sha256 = require('sha256')
const { v4: uuid } = require('uuid')

const currentNodeUrl = process.argv[3];
function Blockchain(){
    this.chain = []; 
    this.newPendingTransactions = [];
    this.currentNodeUrl = currentNodeUrl;
    this.networkNodes = [];
    this.createNewBlock(0,'0','0'); 

}

Blockchain.prototype.createNewBlock = function(nonce,previousBlockHash,hash) {
    const newBlock = {
      index : this.chain.length + 1,
      timestamp : Date.now(),
      transactions: this.newPendingTransactions,
      nonce : nonce,
      hash : hash,
      previousBlockHash : previousBlockHash,
    };

    this.newPendingTransactions = [];
    this.chain.push(newBlock);

    return newBlock;
}

Blockchain.prototype.getLastBlock = function(){
  return this.chain[this.chain.length -1];
}

Blockchain.prototype.createNewTransaction = function(amount, sender, recepient){
  const newTransaction = {
    amount : amount,
    sender : sender,
    recepient : recepient,
    transactionId : uuid()
  };

  
  return newTransaction; // number of the block to which this transaction will be added to

}

Blockchain.prototype.addTransactionToPendingTransactions = function(transaction){
  
  this.newPendingTransactions.push(transaction);

  return this.getLastBlock()['index'] + 1; // number of the block to which this transaction will be added to


}

Blockchain.prototype.hashBlock = function(previousBlockHash,currBlockData,nonce){
  const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currBlockData);
  const hash = sha256(dataAsString);
  return hash;   
}

Blockchain.prototype.proofOfWork = function(previousBlockHash,currBlockData){
  nonce = 0
  while(1){
    nonce = nonce + 1;
    hashValue = this.hashBlock(previousBlockHash,currBlockData,nonce)
    if(hashValue.substring(0,4) == "0000") return nonce
  }
}


Blockchain.prototype.chainIsValid = function(blockchain){
  const chainLength = blockchain.length;
  var isValid = true;
  for(var i = 1 ; i < chainLength ; i++){
    if(blockchain[i]['previousBlockHash']!=blockchain[i-1]['hash']){
      isValid = false;
      break;
    }
    const currBlockData = {transactions: blockchain[i]['transactions'],index : blockchain[i]['index']};

    const blockHash = this.hashBlock(blockchain[i-1]['hash'],currBlockData,blockchain[i].nonce)
    if(blockHash.substring(0,4) != "0000"){
      isValid = false;
      break;
    }
  }
  // we will also rehash every block
  const genesisBlock = blockchain[0];
  if(genesisBlock['nonce']!=0 || genesisBlock['previousBlockHash'] != "0" || genesisBlock['hash']!="0" || genesisBlock['transactions'].length!=0) isValid = false;

  return isValid;
}


Blockchain.prototype.getBlock = function(blockHash){
  let correctBlock = null;
  this.chain.forEach(block => {
    if(block.hash === blockHash) correctBlock = block;
  })
  return correctBlock;
}

Blockchain.prototype.getTransaction = function(transactionId){
  let correctTransaction = null;
  let correctBlock = null;
  this.chain.forEach(block => {
    block.transactions.forEach(transaction => {
      if(transaction.transactionId === transactionId){
        correctBlock = block;
        correctTransaction = transaction;
      }
    })
  })
  return {
    transaction : correctTransaction,
    block : correctBlock
  }
}


Blockchain.prototype.getAddressData = function(address){
  const addressTransactions = [];
  var balance = 0;
  this.chain.forEach(block => {
    block.transactions.forEach(transaction => {
      if(transaction['sender'] == address || transaction['recepient'] == address  ) {
        addressTransactions.push(transaction);

        if(transaction['sender'] == address) balance -= transaction['amount'];
        else balance += transaction['amount'];

      }
    })
  })

  return {
    addressTransactions : addressTransactions,
    addressBalance : balance
  }

}

module.exports = Blockchain;