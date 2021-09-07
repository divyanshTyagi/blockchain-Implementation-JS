const express = require('express')
const app = express()
const Blockchain = require('./blockchain');
const bodyParser = require('body-parser');
const { v4: uuid } = require('uuid');
const port = process.argv[2];
const rp = require('request-promise');

const nodeAdress = uuid().split('-').join('');

const bitcoin = new Blockchain();


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));

app.get('/blockchain', function (req, res) {
  res.send(bitcoin);  
})

app.post('/transaction',function (req, res) {
  console.log(req.body.transaction)
  const blockIndex = bitcoin.addTransactionToPendingTransactions(req.body.transaction)
  res.json({note : `Transaction will be added to ${blockIndex} block`});
})
 
app.post('/transaction/broadcast',function(req, res){
  // req will contain the transactions
  const newTransaction = bitcoin.createNewTransaction(req.body.amount,req.body.sender,req.body.recepient);
  const requestPromises = [];

  bitcoin.addTransactionToPendingTransactions(newTransaction);

  bitcoin.networkNodes.forEach(networkNodeUrl => {
    const requestOptions = {
      uri : networkNodeUrl + '/transaction',
      method : 'POST',
      body : {
        transaction : newTransaction
      },
      json:true
    }
    requestPromises.push(rp(requestOptions));
  })

  Promise.all(requestPromises).then(data => {
    res.json({note : " Transaction created and broadcasted sucessfully"})
  })

})

app.post('/receive-new-block',function(req, res){
  const newBlock = req.body.newBlock;
  const lastBlock = bitcoin.getLastBlock();
  const correctHash =lastBlock.hash == newBlock.previousBlockHash;
  const correctIndex = lastBlock['index'] + 1 === newBlock['index'];
  
  // If the new block is legitimate, accept and add it to the chain 

  if(correctHash && correctIndex){
    bitcoin.chain.push(newBlock);
    bitcoin.newPendingTransactions = [];
    res.json({
      note : "New Block Received and Accepted",
      newBlock : newBlock
    })
  }else{
    res.json({
      note : "New Block Rejected",
      newBlock : newBlock
    })
  }

})

app.get('/mine', function (req, res){
  
  const previousBlock = bitcoin.getLastBlock();
  const previousBlockHash = previousBlock['hash'];
  const currBlockData = {transactions: bitcoin.newPendingTransactions,index: previousBlock['index'] + 1};
  const proofOfWork = bitcoin.proofOfWork(previousBlockHash,currBlockData);
  const hashValue = bitcoin.hashBlock(previousBlockHash,currBlockData,nonce)
 
  const newBlock = bitcoin.createNewBlock(proofOfWork,previousBlockHash,hashValue)


  const requestPromises = []

  bitcoin.networkNodes.forEach(networkNodeUrl => {
    console.log("Making promis for ", networkNodeUrl + '/receive-new-block') ;
    
    const requestOptions = {
      uri : networkNodeUrl + '/receive-new-block',
      method : 'POST',
      body : {
        newBlock : newBlock
      },
      json : true
    }

    requestPromises.push(rp(requestOptions));

  })

  Promise.all(requestPromises).then(data => {
    const requestOptions = {
      uri : bitcoin.currentNodeUrl + '/transaction/broadcast',
      method : 'POST',
      body : {
        amount : 12.5,
        sender: "00",
        recepient : nodeAdress
      },
      json:true
    }
    return rp(requestOptions);

  }).then(data => {
    res.json({
      'note': "New Block Mined succesfully",
      "block": newBlock
    });
  })
})


// register a node and broadcast itself to the whole network
app.post('/register-and-broadcast-node', function(req, res){
  const newNodeUrl = req.body.newNodeUrl; 
  if(bitcoin.networkNodes.indexOf(newNodeUrl) == -1){
    bitcoin.networkNodes.push(newNodeUrl);
  }


  const regNodesPromises = [];

  bitcoin.networkNodes.forEach(networkNodeUrl => {
    const requestOptions = {
      uri : networkNodeUrl + '/register-node',
      method : 'POST',
      body : {
        newNodeUrl : newNodeUrl
      },
      json:true
    }
    regNodesPromises.push(rp(requestOptions));
  })

  Promise.all(regNodesPromises).then(data => {
    const bulkRegisterOptions = {
      uri : newNodeUrl + '/register-nodes-bulk',
      method : 'POST',
      body : {
        allNetworkNodes : [...bitcoin.networkNodes,bitcoin.currentNodeUrl]
      },
      json:true
    }

    return rp(bulkRegisterOptions);

  }).then(data => {
    res.json({note : "New node registered with network succefully"})
  });

})

// register another node with the network
app.post('/register-node',function (req, res){
    const newNodeUrl = req.body.newNodeUrl;
    if(bitcoin.currentNodeUrl!=newNodeUrl && bitcoin.networkNodes.indexOf(newNodeUrl) == -1) bitcoin.networkNodes.push(newNodeUrl)
    res.json({note : "New node registered sucessfully using register-note endpoint"})
})

// register multiple nodes at once
app.post('/register-nodes-bulk', function(req, res){
  req.body.allNetworkNodes.forEach(networkNodeUrl=>{
    if(networkNodeUrl!=bitcoin.currentNodeUrl && bitcoin.networkNodes.indexOf(networkNodeUrl) == -1){
      bitcoin.networkNodes.push(networkNodeUrl)
    }
  })
  res.json({note : "Bulk Registration successful"});
})

// CONSENSUS
app.get('/concensus',function(req, res){
  
  const requestPromises = [];
  
  bitcoin.networkNodes.forEach(networkNodeUrl=>{
    const requestOptions = {
      uri : networkNodeUrl + '/blockchain',
      method : 'GET',
      json : true
    }
    requestPromises.push(rp(requestOptions));
  })

  Promise.all(requestPromises).then(blockchains => {
    
    const currChainLength = bitcoin.chain.length;
    let maxChainLength = currChainLength;
    let newLongestChain = null;
    let newPendingTransaction = null;
    
    blockchains.forEach(blockchain => {
      if(blockchain.chain.length > maxChainLength){
        maxChainLength = blockchain.chain.length;
        newLongestChain = blockchain.chain;
        newPendingTransaction = blockchain['newPendingTransactions'];
      }
    })

    if(!newLongestChain || (!bitcoin.chainIsValid(newLongestChain))){
      res.json({
        note : "Current chain has not been replaced",
        chain : bitcoin.chain
      })
    }else{
      bitcoin.chain = newLongestChain;
      bitcoin.newPendingTransactions = newPendingTransaction;
      res.json({
        note : "Current chain has been replaced",
        chain : bitcoin.chain
      })
    }

  })

})


// Block Explorer

app.get('/block/:blockHash', function ( req,res) {
  const blockHash = req.params.blockHash;
  const correctBlock = bitcoin.getBlock(blockHash);
  res.json({
    block : correctBlock
  })

});

app.get('/transaction/:transactionId', function (req, res){
  const transactionId = req.params.transactionId;
  const transactionBlockPair = bitcoin.getTransaction(transactionId);
  const correctTransaction = transactionBlockPair['transaction'];
  const correctBlock = transactionBlockPair['block'];
  res.json({
    block : correctBlock,
    transaction : correctTransaction
  })
});

app.get('/address/:address',function(req,res) {
  const address = req.params.address;
  const addressData = bitcoin.getAddressData(address);
  res.json({
    addressData : addressData
  })
});


// endpoint to get the block explorer
app.get('/block-explorer', function(req,res)  {
  res.sendFile('./block explorer/index.html', {root : __dirname});
})
app.listen(port,function(){
  console.log(`Listening at port ${port}`)
})