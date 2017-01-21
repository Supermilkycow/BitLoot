
(function (global) {
  "use strict";
  var sjcl = global.sjcl;
  var bitloot = {};
  global.bitloot = bitloot;

  // bitloot.run = function(targetBlockHeight, address, ticketPrice, giftEvery, maxWinners, callback, updateBlock, updateTxs) {
  bitloot.run = function(targetBlockHeight, prizeLevel, maxWinners, manTotal, callback, updateBlock, updateTxs) {

    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var callbackFinalize = function(result) {
      setTimeout(function () { callback(undefined, result); }, 0);
    };

    // var TX_PROCESS_BATCH = 20;
    // var ticketsList = [];
    // var ticketsIndex = {};


      var getTxs = function(targetBlockHeight, calcCallback ) {
          var result = new Array();
          var apiUrl = "http://btc.blockr.io/api/v1/block/txs/" + targetBlockHeight;
          get(apiUrl, function(err, response) {
                  if (err) {
                      error(err);
                      return;
                  }
                  var apiResult = JSON.parse(response);
                  if (apiResult.data === undefined || apiResult.data.txs === undefined) {
                      error("Server returned incorrect data. Request URL: " + apiUrl);
                      return;
                  }

                  var txs = apiResult.data.txs;
                  var data = apiResult.data;
                  var isFinalPage = true;

                  for (var i=0;i<maxWinners && i<txs.length ;i++)
                  {
                      var winner_id ;
                      var last8digit =   txs[i].tx;
                      last8digit = last8digit.substr(-8, last8digit.length);

                      winner_id= parseInt(last8digit.toString(),16);

                      winner_id = winner_id % manTotal;

                      result.push(winner_id + 1);
                  }

                  callbackFinalize(result);
              }
          );

      };




      var calWinner = function(txs) {
        alert("targetBlockHeight="+targetBlockHeight+"&prizeLevel="+prizeLevel+"&maxWinners="+maxWinners+"&manTotal="+manTotal);
        var result = new Array("110");
        callbackFinalize(result);
    }

    var blocksCallback = function(err, blocks) {
      if (err) {
        error(err);
        return;
      }

      setTimeout(function () { updateBlock({height: blocks[0].nb}); }, 0);
      console.log("last:"+targetBlockHeight+"!="+"block="+blocks[0].nb);
      if (blocks[0].nb === targetBlockHeight) {
       //   alert("中奖者诞生!");
          setTimeout(function () { getTxs(targetBlockHeight); }, 0);
      }
      else if(blocks[0].nb < targetBlockHeight){
          setTimeout(function () { getBlocks("last,"+targetBlockHeight, blocksCallback); }, 1500);
      }
      else {
         alert("若不是验证历史抽奖，请重新选择 Block! 最新网络上的Block为： "+blocks[0].nb+", 请至少输入一个比这个大的数值.");
         setTimeout(function () { getTxs(targetBlockHeight); }, 0);
      }
    };

    // Get latest block,
    getBlocks("last,"+targetBlockHeight, blocksCallback);
  };

  function getBlocks(heightQuery, callback) {
    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var requestUrl = "http://btc.blockr.io/api/v1/block/info/" + heightQuery;
    // var requestUrl = "http://btc.blockr.io/api/v1/block/info/last";
    console.log(requestUrl);

    get(requestUrl, function(err, response) {
      if (err) {
        error(err);
        return;
      }

      var apiResult = JSON.parse(response);
      if (apiResult.data === undefined) {
        error("Server returned incorrect data. Request URL: " + requestUrl);
        return;
      }
      else if (apiResult.data.length === 0) {
        error("Block " + heightQuery + " was not not found. Request URL: " + requestUrl);
        return;
      }

      var blocks;
      if (apiResult.data instanceof Array) {
        blocks = apiResult.data;
      } else {
        blocks = [apiResult.data];
      }
      setTimeout(function () { callback(undefined, blocks); }, 0);

    });
  }


  function get(url, callback) {
    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var request = new XMLHttpRequest();

    request.open('GET', url, true);

    request.onload = function() {
      if (request.status >= 200 && request.status < 400){
        setTimeout(function () { callback(undefined, request.responseText); }, 0);
      } else {
        error(request.statusText === "" ? "Could not get "+ url : request.statusText);
      }
    };

    request.onerror = function() {
      error(request.statusText === "" ? "Could not get "+ url : request.statusText);
    };

    request.send();
  }

})(this);