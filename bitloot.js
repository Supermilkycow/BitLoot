(function (global) {
  "use strict";

  var bitloot = {};
  var API_BASE = "https://blockstream.info/api";
  var DEFAULT_POLL_INTERVAL = 30000;

  global.bitloot = bitloot;

  bitloot.API_BASE = API_BASE;
  bitloot.getLatestHeight = getLatestHeight;
  bitloot.getBlockHash = getBlockHash;
  bitloot.getBlockTxids = getBlockTxids;

  bitloot.validateOptions = function (options) {
    var targetBlockHeight = toInteger(options.targetBlockHeight, "目标 Block");
    var prizeLevel = toInteger(options.prizeLevel, "奖品等级");
    var maxWinners = toInteger(options.maxWinners, "中奖人数");
    var manTotal = toInteger(options.manTotal, "总人数");

    if (targetBlockHeight < 0) {
      throw new Error("目标 Block 不能小于 0。");
    }
    if (prizeLevel < 1) {
      throw new Error("奖品等级必须大于等于 1。");
    }
    if (maxWinners < 1) {
      throw new Error("中奖人数必须大于等于 1。");
    }
    if (manTotal < 1) {
      throw new Error("总人数必须大于等于 1。");
    }
    if (maxWinners > manTotal) {
      throw new Error("中奖人数不能大于总人数，否则无法产生不重复中奖名单。");
    }

    return {
      targetBlockHeight: targetBlockHeight,
      prizeLevel: prizeLevel,
      maxWinners: maxWinners,
      manTotal: manTotal
    };
  };

  bitloot.calculateWinners = function (txids, maxWinners, manTotal) {
    if (!Array.isArray(txids) || txids.length === 0) {
      throw new Error("目标区块没有可用于抽奖的交易哈希。");
    }

    maxWinners = toInteger(maxWinners, "中奖人数");
    manTotal = toInteger(manTotal, "总人数");

    var winners = [];
    var seen = {};
    var draws = [];
    var duplicates = [];

    for (var i = 0; i < txids.length && winners.length < maxWinners; i++) {
      var txid = String(txids[i]);
      var last8 = txid.slice(-8);
      var rawValue = parseInt(last8, 16);

      if (!isFinite(rawValue) || isNaN(rawValue)) {
        continue;
      }

      var winnerId = (rawValue % manTotal) + 1;
      var draw = {
        order: i + 1,
        txid: txid,
        last8: last8,
        value: rawValue,
        winner: winnerId,
        duplicate: Boolean(seen[winnerId])
      };

      draws.push(draw);

      if (draw.duplicate) {
        duplicates.push(draw);
        continue;
      }

      seen[winnerId] = true;
      winners.push(draw);
    }

    return {
      winners: winners,
      draws: draws,
      duplicates: duplicates,
      txCount: txids.length,
      complete: winners.length === maxWinners
    };
  };

  bitloot.run = function (targetBlockHeight, prizeLevel, maxWinners, manTotal, callback, updateBlock, updateTxs) {
    var options;
    try {
      options = bitloot.validateOptions({
        targetBlockHeight: targetBlockHeight,
        prizeLevel: prizeLevel,
        maxWinners: maxWinners,
        manTotal: manTotal
      });
    } catch (err) {
      return defer(function () { callback(err.message); });
    }

    var finished = false;
    var pollInterval = DEFAULT_POLL_INTERVAL;

    function fail(message) {
      if (finished) { return; }
      finished = true;
      defer(function () { callback(message); });
    }

    function done(result) {
      if (finished) { return; }
      finished = true;
      defer(function () { callback(undefined, result); });
    }

    function emitBlock(latestHeight, status) {
      if (typeof updateBlock === "function") {
        defer(function () {
          updateBlock({
            height: latestHeight,
            target: options.targetBlockHeight,
            status: status
          });
        });
      }
    }

    function waitForBlock() {
      getLatestHeight(function (err, latestHeight) {
        if (err) {
          fail(err);
          return;
        }

        emitBlock(latestHeight, latestHeight >= options.targetBlockHeight ? "ready" : "waiting");

        if (latestHeight >= options.targetBlockHeight) {
          loadTargetBlock();
        } else {
          defer(function () { waitForBlock(); }, pollInterval);
        }
      });
    }

    function loadTargetBlock() {
      getBlockHash(options.targetBlockHeight, function (err, blockHash) {
        if (err) {
          fail(err);
          return;
        }

        getBlockTxids(blockHash, function (txErr, txids) {
          if (txErr) {
            fail(txErr);
            return;
          }

          var calculation;
          try {
            calculation = bitloot.calculateWinners(txids, options.maxWinners, options.manTotal);
          } catch (calcErr) {
            fail(calcErr.message);
            return;
          }

          calculation.blockHeight = options.targetBlockHeight;
          calculation.blockHash = blockHash;
          calculation.prizeLevel = options.prizeLevel;
          calculation.maxWinners = options.maxWinners;
          calculation.manTotal = options.manTotal;
          calculation.apiBase = API_BASE;

          if (typeof updateTxs === "function") {
            defer(function () { updateTxs(calculation); });
          }

          done(calculation);
        });
      });
    }

    waitForBlock();
  };

  function getLatestHeight(callback) {
    getText(API_BASE + "/blocks/tip/height", function (err, responseText) {
      if (err) {
        callback(err);
        return;
      }

      var height = Number(String(responseText).trim());
      if (!isFinite(height) || isNaN(height)) {
        callback("区块链 API 返回了无效的最新高度。");
        return;
      }

      callback(undefined, height);
    });
  }

  function getBlockHash(height, callback) {
    getText(API_BASE + "/block-height/" + encodeURIComponent(height), function (err, responseText) {
      if (err) {
        callback(err);
        return;
      }

      var hash = String(responseText).trim();
      if (!/^[0-9a-f]{64}$/i.test(hash)) {
        callback("区块链 API 返回了无效的区块 Hash。");
        return;
      }

      callback(undefined, hash);
    });
  }

  function getBlockTxids(blockHash, callback) {
    getJson(API_BASE + "/block/" + encodeURIComponent(blockHash) + "/txids", function (err, txids) {
      if (err) {
        callback(err);
        return;
      }

      if (!Array.isArray(txids)) {
        callback("区块链 API 返回了无效的交易列表。");
        return;
      }

      callback(undefined, txids);
    });
  }

  function getJson(url, callback) {
    getText(url, function (err, responseText) {
      if (err) {
        callback(err);
        return;
      }

      try {
        callback(undefined, JSON.parse(responseText));
      } catch (parseErr) {
        callback("无法解析区块链 API 响应：" + parseErr.message);
      }
    });
  }

  function getText(url, callback) {
    var request = new XMLHttpRequest();

    request.open("GET", url, true);
    request.timeout = 20000;

    request.onload = function () {
      if (request.status >= 200 && request.status < 400) {
        callback(undefined, request.responseText);
      } else {
        callback("请求区块链 API 失败（HTTP " + request.status + "）：" + url);
      }
    };

    request.onerror = function () {
      callback("无法连接区块链 API：" + url);
    };

    request.ontimeout = function () {
      callback("请求区块链 API 超时：" + url);
    };

    request.send();
  }

  function toInteger(value, label) {
    var number = Number(value);
    if (!isFinite(number) || isNaN(number) || Math.floor(number) !== number) {
      throw new Error(label + "必须是整数。");
    }
    return number;
  }

  function defer(fn, delay) {
    setTimeout(fn, delay || 0);
  }

})(this);
