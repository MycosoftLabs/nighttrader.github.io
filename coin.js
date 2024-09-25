

$( function() {

console.log("Init coinjs");

var coinjs = window.coinjs = function () { };

coinjs.bech32 = {'charset':'qpzry9x8gf2tvdw0s3jn54khce6mua7l', 'version':0, 'hrp':'bc'};

coinjs.isArray = function(o){
  return Object.prototype.toString.call(o) === '[object Array]';
}

coinjs.hash256 = function(bytes) {
  return Crypto.SHA256(Crypto.SHA256(bytes, {asBytes: true}), {asBytes: true});
}

coinjs.arrayEquals = function(a, b) {
  return Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index]);
}

coinjs.bech32_polymod = function(values) {
  var chk = 1;
  var BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  for (var p = 0; p < values.length; ++p) {
    var top = chk >> 25;
    chk = (chk & 0x1ffffff) << 5 ^ values[p];
    for (var i = 0; i < 5; ++i) {
      if ((top >> i) & 1) {
        chk ^= BECH32_GENERATOR[i];
      }
    }
  }
  return chk;
}

coinjs.bech32_hrpExpand = function(hrp) {
  var ret = [];
  var p;
  for (p = 0; p < hrp.length; ++p) {
    ret.push(hrp.charCodeAt(p) >> 5);
  }
  ret.push(0);
  for (p = 0; p < hrp.length; ++p) {
    ret.push(hrp.charCodeAt(p) & 31);
  }
  return ret;
}

coinjs.bech32_verifyChecksum = function(hrp, data) {
  return coinjs.bech32_polymod(coinjs.bech32_hrpExpand(hrp).concat(data)) === 1;
}

coinjs.bech32_decode = function(bechString) {
  var p;
  var has_lower = false;
  var has_upper = false;
  for (p = 0; p < bechString.length; ++p) {
    if (bechString.charCodeAt(p) < 33 || bechString.charCodeAt(p) > 126) {
      return null;
    }
    if (bechString.charCodeAt(p) >= 97 && bechString.charCodeAt(p) <= 122) {
      has_lower = true;
    }
    if (bechString.charCodeAt(p) >= 65 && bechString.charCodeAt(p) <= 90) {
      has_upper = true;
    }
  }
  if (has_lower && has_upper) {
    return null;
  }
  bechString = bechString.toLowerCase();
  var pos = bechString.lastIndexOf('1');
  if (pos < 1 || pos + 7 > bechString.length || bechString.length > 90) {
    return null;
  }
  var hrp = bechString.substring(0, pos);
  var data = [];
  for (p = pos + 1; p < bechString.length; ++p) {
    var d = coinjs.bech32.charset.indexOf(bechString.charAt(p));
    if (d === -1) {
      return null;
    }
    data.push(d);
  }
  if (!coinjs.bech32_verifyChecksum(hrp, data)) {
    return null;
  }
  return {
    hrp: hrp,
    data: data.slice(0, data.length - 6)
  };
}

coinjs.bech32_convert = function(data, inBits, outBits, pad) {
  var value = 0;
  var bits = 0;
  var maxV = (1 << outBits) - 1;

  var result = [];
  for (var i = 0; i < data.length; ++i) {
    value = (value << inBits) | data[i];
    bits += inBits;

    while (bits >= outBits) {
      bits -= outBits;
      result.push((value >> bits) & maxV);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((value << (outBits - bits)) & maxV);
    }
  } else {
    if (bits >= inBits) throw new Error('Excess padding');
    if ((value << (outBits - bits)) & maxV) throw new Error('Non-zero padding');
  }

  return result;
}


coinjs.bech32redeemscript = function(address){
  var r = false;
  var decode = coinjs.bech32_decode(address);
  if(decode){
    decode.data.shift();
    return Crypto.util.bytesToHex(coinjs.bech32_convert(decode.data, 5, 8, false));
  }
  return r;
}

var CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
var CHARSET_INVERSE_INDEX = {
  'q': 0, 'p': 1, 'z': 2, 'r': 3, 'y': 4, '9': 5, 'x': 6, '8': 7,
  'g': 8, 'f': 9, '2': 10, 't': 11, 'v': 12, 'd': 13, 'w': 14, '0': 15,
  's': 16, '3': 17, 'j': 18, 'n': 19, '5': 20, '4': 21, 'k': 22, 'h': 23,
  'c': 24, 'e': 25, '6': 26, 'm': 27, 'u': 28, 'a': 29, '7': 30, 'l': 31,
};

var convertBits = function(data, from, to) {
  let length = Math.ceil(data.length * from / to);
  let mask = (1 << to) - 1;
  let result = [];
  for(let i=0; i< length; ++i) { result.push(0); }
  let index = 0;
  let accumulator = 0;
  let bits = 0;
  for (let i=0; i< data.length; ++i) {
    let value = data[i];
    accumulator = (accumulator << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result[index] = (accumulator >> bits) & mask;
      ++index;
    }
  }
  if (bits > 0) {
    result[index] = (accumulator << (to - bits)) & mask;
    ++index;
  }
  return result;
};

var base32polymod = function(data) {
  let GENERATOR = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let checksum = 1n;
  for (let i=0; i< data.length; ++i) {
    let value = data[i];
    let topBits = checksum >> 35n;
    checksum = ((checksum & 0x07ffffffffn) << 5n) ^ BigInt(value);
    for (let j=0; j< GENERATOR.length; ++j) {
      if (((topBits >> BigInt(j)) & 1n) == 1n) {
        checksum = checksum ^ BigInt(GENERATOR[j]);
      }
    }
  }
  return checksum ^ 1n;
}

var decodeBase32AsBytes = function(string) {
  let data = [];
  for (let i = 0; i < string.length; ++i) {
    let value = string[i];
    data.push(CHARSET_INVERSE_INDEX[value]);
  }
  data = data.slice(0,data.length-8); // minus checksum
  let bytes = convertBits(data, 5,8);
  bytes = bytes.slice(0, bytes.length-1);
  let probe = encodeBytesToBase32(bytes);
  if (probe != string) {
    return false;
  }
  return bytes;
};

var encodeBytesToBase32 = function (bytes) {
  let data = convertBits(bytes, 8,5);
  let prefixToUint5Array = function(prefix) {
    let result = [];
    for (let i=0; i < prefix.length; ++i) {
      result.push(prefix[i].charCodeAt(0) & 31);
    }
    return result;
  }
  let chksumx = prefixToUint5Array(coinjs.base32pref);
  chksumx.push(0);
  chksumx.push(...data);
  chksumx.push(...[0,0,0,0, 0,0,0,0]);
  let checksumToUint5Array = function(checksum) {
    let result = [0,0,0,0, 0,0,0,0];
    for (let i= 0; i< 8; ++i) {
      result[7 - i] = Number(checksum & 31n);
      checksum = checksum >> 5n;
    }
    return result;
  }
  data.push(...checksumToUint5Array(base32polymod(chksumx)));
  let base32 = '';
  for (let i = 0; i < data.length; ++i) {
    let value = data[i];
    base32 += CHARSET[value];
  }
  return base32;
};

coinjs.script = function(data) {
  var r = {};

  if(!data){
    r.buffer = [];
  } else if ("string" == typeof data) {
    r.buffer = Crypto.util.hexToBytes(data);
  } else if (coinjs.isArray(data)) {
    r.buffer = data;
  } else if (data instanceof coinjs.script) {
    r.buffer = data.buffer;
  } else {
    r.buffer = data;
  }

  /* parse buffer array */
  r.parse = function () {

    var self = this;
    r.chunks = [];
    var i = 0;

    function readChunk(n) {
      self.chunks.push(self.buffer.slice(i, i + n));
      i += n;
    };

    while (i < this.buffer.length) {
      var opcode = this.buffer[i++];
      if (opcode >= 0xF0) {
          opcode = (opcode << 8) | this.buffer[i++];
      }

      var len;
      if (opcode > 0 && opcode < 76) { //OP_PUSHDATA1
        readChunk(opcode);
      } else if (opcode == 76) { //OP_PUSHDATA1
        len = this.buffer[i++];
        readChunk(len);
      } else if (opcode == 77) { //OP_PUSHDATA2
          len = (this.buffer[i++] << 8) | this.buffer[i++];
        readChunk(len);
      } else if (opcode == 78) { //OP_PUSHDATA4
        len = (this.buffer[i++] << 24) | (this.buffer[i++] << 16) | (this.buffer[i++] << 8) | this.buffer[i++];
        readChunk(len);
      } else {
        this.chunks.push(opcode);
      }

      if(i<0x00){
        break;
      }
    }

    return true;
  };

  /* create output script to spend */
  r.spendToScript = function(address){
    var addr = coinjs.addressDecode(address);
    var s = coinjs.script();
    if(addr.type == "bech32"){
      s.writeOp(0);
      s.writeBytes(Crypto.util.hexToBytes(addr.redeemscript));
    } else if(coinjs.arrayEquals(addr.version,coinjs.multisig) || addr.type == 'multisig'){ // multisig address
      s.writeOp(169); //OP_HASH160
      s.writeBytes(addr.bytes);
      s.writeOp(135); //OP_EQUAL
    } else { // regular address
      s.writeOp(118); //OP_DUP
      s.writeOp(169); //OP_HASH160
      s.writeBytes(addr.bytes);
      s.writeOp(136); //OP_EQUALVERIFY
      s.writeOp(172); //OP_CHECKSIG
    }
    return s;
  }

  /* geneate a (script) pubkey hash of the address - used for when signing */
  r.pubkeyHash = function(address) {
    var addr = coinjs.addressDecode(address);
    var s = coinjs.script();
    s.writeOp(118);//OP_DUP
    s.writeOp(169);//OP_HASH160
    s.writeBytes(addr.bytes);
    s.writeOp(136);//OP_EQUALVERIFY
    s.writeOp(172);//OP_CHECKSIG
    return s;
  }

  /* write to buffer */
  r.writeOp = function(op){
    this.buffer.push(op);
    this.chunks.push(op);
    return true;
  }

  /* write bytes to buffer */
  r.writeBytes = function(data){
    if (data.length < 76) {  //OP_PUSHDATA1
      this.buffer.push(data.length);
    } else if (data.length <= 0xff) {
      this.buffer.push(76); //OP_PUSHDATA1
      this.buffer.push(data.length);
    } else if (data.length <= 0xffff) {
      this.buffer.push(77); //OP_PUSHDATA2
      this.buffer.push(data.length & 0xff);
      this.buffer.push((data.length >>> 8) & 0xff);
    } else {
      this.buffer.push(78); //OP_PUSHDATA4
      this.buffer.push(data.length & 0xff);
      this.buffer.push((data.length >>> 8) & 0xff);
      this.buffer.push((data.length >>> 16) & 0xff);
      this.buffer.push((data.length >>> 24) & 0xff);
    }
    this.buffer = this.buffer.concat(data);
    this.chunks.push(data);
    return true;
  }

  r.parse();
  return r;
}

/* create a new transaction object */
coinjs.transaction = function() {

  var r = {};
  r.version = coinjs.txversion;
  r.lock_time = 0;
  r.ins = [];
  r.outs = [];
  r.witness = [];
  r.timestamp = null;
  r.block = null;

  r.nTime = 0;

  /* add an input to a transaction */
  r.addinput = function(txid, index, script, sequence, value){
    var o = {};
    o.outpoint = {'hash':txid, 'index':index};
    o.script = coinjs.script(script||[]);
    o.sequence = sequence || ((r.lock_time==0) ? 4294967295 : 0);
    if (typeof value == "bigint")
      o.value = new BigInteger(value.toString());
    else o.value = value ? new BigInteger('' + Math.round((value*1) * 1e8), 10) : null;
    return this.ins.push(o);
  }

  /* add an output to a transaction */
  r.addoutput = function(address, value){
    var o = {};
    if (typeof value == "bigint")
      o.value = new BigInteger(value.toString());
    else o.value = new BigInteger('' + Math.round((value*1) * 1e8), 10);
    var s = coinjs.script();
    o.script = s.spendToScript(address);

    return this.outs.push(o);
  }

  /* add data to a transaction */
  r.adddata = function(data, value){
    var r = false;
    if(((data.match(/^[a-f0-9]+$/gi)) && data.length<160) && (data.length%2)==0) {
      var s = coinjs.script();
      s.writeOp(106); // OP_RETURN
      s.writeBytes(Crypto.util.hexToBytes(data));
      o = {};
      o.value = value;
      o.script = s;
      return this.outs.push(o);
    }
    return r;
  }

  /* generate the transaction hash to sign from a transaction input */
  r.transactionHash = function(index, sigHashType) {

    var clone = coinjs.clone(this);
    var shType = sigHashType || 1;
    if (coinjs.shf == 0x40) {
      shType = shType | 0x40;
    }

    /* black out all other ins, except this one */
    for (var i = 0; i < clone.ins.length; i++) {
      if(index!=i){
        clone.ins[i].script = coinjs.script();
      }
    }

    var extract = this.extractScriptKey(index);
    clone.ins[index].script = coinjs.script(extract['script']);

    if((clone.ins) && clone.ins[index]){

      /* SIGHASH : For more info on sig hashs see https://en.bitcoin.it/wiki/OP_CHECKSIG
        and https://bitcoin.org/en/developer-guide#signature-hash-type */

      var shMask = shType & 0xe0;
      var shValue = shType & 0x1f;

      if(shValue == 1){
        //SIGHASH_ALL 0x01

      } else if(shValue == 2){
        //SIGHASH_NONE 0x02
        clone.outs = [];
        for (var i = 0; i < clone.ins.length; i++) {
          if(index!=i){
            clone.ins[i].sequence = 0;
          }
        }

      } else if(shValue == 3){

        //SIGHASH_SINGLE 0x03
        clone.outs.length = index + 1;

        for(var i = 0; i < index; i++){
          clone.outs[i].value = -1;
          clone.outs[i].script.buffer = [];
        }

        for (var i = 0; i < clone.ins.length; i++) {
          if(index!=i){
            clone.ins[i].sequence = 0;
          }
        }

      }

//      else if (shType >= 128){
//        //SIGHASH_ANYONECANPAY 0x80
//        clone.ins = [clone.ins[index]];
//
//        if(shType==129){
//          // SIGHASH_ALL + SIGHASH_ANYONECANPAY
//
//        } else if(shType==130){
//          // SIGHASH_NONE + SIGHASH_ANYONECANPAY
//          clone.outs = [];
//
//        } else if(shType==131){
//          // SIGHASH_SINGLE + SIGHASH_ANYONECANPAY
//          clone.outs.length = index + 1;
//          for(var i = 0; i < index; i++){
//            clone.outs[i].value = -1;
//            clone.outs[i].script.buffer = [];
//          }
//        }
//      }

      var currentInput = clone.ins[index];

      if (shMask & 0x80){
        //SIGHASH_ANYONECANPAY 0x80
        clone.ins = [clone.ins[index]];
      }

//      var buffer = Crypto.util.hexToBytes(clone.serialize());
//      buffer = buffer.concat(coinjs.numToBytes(parseInt(shType), 4));

      var buffer;
      if (!(shMask & 0x40)){
        buffer = Crypto.util.hexToBytes(clone.serialize());
        buffer = buffer.concat(coinjs.numToBytes(parseInt(shType), 4));
      } else { /* SIGHASH_FORKID is flagged, perform BIP143 hashing. */
        let zeroh = [0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0];
        buffer = []
        buffer = buffer.concat(coinjs.numToBytes(parseInt(clone.version),4));
        if (shMask & 0x80) //SIGHASH_ANYONECANPAY 0x80
          buffer = buffer.concat(zeroh);
        else buffer = buffer.concat(coinjs.hash256(clone.getPrevouts()));
        if (!(shMask & 0x80) && shValue != 3 && shValue != 2) //!SIGHASH_ANYONECANPAY !=SIGHASH_SINGLE !=SIGHASH_NONE
          buffer = buffer.concat(coinjs.hash256(clone.getSequences()));
        else buffer = buffer.concat(zeroh);
        buffer = buffer.concat(Crypto.util.hexToBytes(currentInput.outpoint.hash).reverse());
        buffer = buffer.concat(coinjs.numToBytes(parseInt(currentInput.outpoint.index),4));
        buffer = buffer.concat(coinjs.numToVarInt(currentInput.script.buffer.length));
        buffer = buffer.concat(currentInput.script.buffer);
        buffer = buffer.concat(coinjs.numToBytes(currentInput.value,8));
        buffer = buffer.concat(coinjs.numToBytes(parseInt(currentInput.sequence),4));
        if (shValue != 3 && shValue != 2) //!=SIGHASH_SINGLE !=SIGHASH_NONE
          buffer = buffer.concat(coinjs.hash256(clone.getOutputs()));
        else if (shValue == 3)
          buffer = buffer.concat(coinjs.hash256(clone.getOutput(index))); // todo!
        else buffer = buffer.concat(zeroh);
        buffer = buffer.concat(coinjs.numToBytes(parseInt(this.lock_time),4));
        buffer = buffer.concat(coinjs.numToBytes(parseInt(shType), 4));
        //console.log("sighash buffer", Crypto.util.bytesToHex(buffer));
      }

      var hash = Crypto.SHA256(buffer, {asBytes: true});
      var r = Crypto.util.bytesToHex(Crypto.SHA256(hash, {asBytes: true}));
      return r;
    } else {
      return false;
    }
  }

  r.getPrevouts = function() {
    var buffer = [];
    for (var i = 0; i < this.ins.length; i++) {
      var txin = this.ins[i];
      buffer = buffer.concat(Crypto.util.hexToBytes(txin.outpoint.hash).reverse());
      buffer = buffer.concat(coinjs.numToBytes(parseInt(txin.outpoint.index),4));
    }
    return buffer;
  }

  r.getSequences = function() {
    var buffer = [];
    for (var i = 0; i < this.ins.length; i++) {
      var txin = this.ins[i];
      buffer = buffer.concat(coinjs.numToBytes(parseInt(txin.sequence),4));
    }
    return buffer;
  }

  r.getOutputs = function() {
    var buffer = [];
    for (var i = 0; i < this.outs.length; i++) {
      var txout = this.outs[i];
      buffer = buffer.concat(coinjs.numToBytes(txout.value,8));
      var scriptBytes = txout.script.buffer;
      buffer = buffer.concat(coinjs.numToVarInt(scriptBytes.length));
      buffer = buffer.concat(scriptBytes);
    }
    return buffer;
  }

  r.getOutput = function(idx) {
    var buffer = [];
    for (var i = 0; i < this.outs.length; i++) {
      if (i == idx) {
        var txout = this.outs[i];
        buffer = buffer.concat(coinjs.numToBytes(txout.value,8));
        var scriptBytes = txout.script.buffer;
        buffer = buffer.concat(coinjs.numToVarInt(scriptBytes.length));
        buffer = buffer.concat(scriptBytes);
      }
    }
    return buffer;
  }

  /* extract the scriptSig, used in the transactionHash() function */
  r.extractScriptKey = function(index) {
    if(this.ins[index]){
      if((this.ins[index].script.chunks.length==5) && this.ins[index].script.chunks[4]==172 && coinjs.isArray(this.ins[index].script.chunks[2])){ //OP_CHECKSIG
        // regular scriptPubkey (not signed)
        return {'type':'scriptpubkey', 'signed':'false', 'signatures':0, 'script': Crypto.util.bytesToHex(this.ins[index].script.buffer)};
      } else if((this.ins[index].script.chunks.length==2) && this.ins[index].script.chunks[0][0]==48 && this.ins[index].script.chunks[1].length == 5 && this.ins[index].script.chunks[1][1]==177){//OP_CHECKLOCKTIMEVERIFY
        // hodl script (signed)
        return {'type':'hodl', 'signed':'true', 'signatures':1, 'script': Crypto.util.bytesToHex(this.ins[index].script.buffer)};
      } else if((this.ins[index].script.chunks.length==2) && this.ins[index].script.chunks[0][0]==48){
        // regular scriptPubkey (probably signed)
        return {'type':'scriptpubkey', 'signed':'true', 'signatures':1, 'script': Crypto.util.bytesToHex(this.ins[index].script.buffer)};
      } else if(this.ins[index].script.chunks.length == 5 && this.ins[index].script.chunks[1] == 177){//OP_CHECKLOCKTIMEVERIFY
        // hodl script (not signed)
        return {'type':'hodl', 'signed':'false', 'signatures': 0, 'script': Crypto.util.bytesToHex(this.ins[index].script.buffer)};
      } else if((this.ins[index].script.chunks.length <= 3 && this.ins[index].script.chunks.length > 0) && this.ins[index].script.chunks[0].length == 22 && this.ins[index].script.chunks[0][0] == 0){
        // segwit script
        var signed = ((this.witness[index]) && this.witness[index].length==2) ? 'true' : 'false';
        var sigs = (signed == 'true') ? 1 : 0;
        var value = -1; // no value found
        if((this.ins[index].script.chunks[2]) && this.ins[index].script.chunks[2].length==8){
          value = coinjs.bytesToNum(this.ins[index].script.chunks[2]);  // value found encoded in transaction (THIS IS NON STANDARD)
        }
        return {'type':'segwit', 'signed':signed, 'signatures': sigs, 'script': Crypto.util.bytesToHex(this.ins[index].script.chunks[0]), 'value': value};
      } else if (this.ins[index].script.chunks[0]==0 && this.ins[index].script.chunks[this.ins[index].script.chunks.length-1][this.ins[index].script.chunks[this.ins[index].script.chunks.length-1].length-1]==174) { // OP_CHECKMULTISIG
        // multisig script, with signature(s) included
        return {'type':'multisig', 'signed':'true', 'signatures':this.ins[index].script.chunks.length-2, 'script': Crypto.util.bytesToHex(this.ins[index].script.chunks[this.ins[index].script.chunks.length-1])};
      } else if (this.ins[index].script.chunks[0]>=80 && this.ins[index].script.chunks[this.ins[index].script.chunks.length-1]==174) { // OP_CHECKMULTISIG
        // multisig script, without signature!
        return {'type':'multisig', 'signed':'false', 'signatures':0, 'script': Crypto.util.bytesToHex(this.ins[index].script.buffer)};
      } else if (this.ins[index].script.chunks.length==0) {
        // empty
        return {'type':'empty', 'signed':'false', 'signatures':0, 'script': ''};
      } else {
        // something else
        return {'type':'unknown', 'signed':'false', 'signatures':0, 'script':Crypto.util.bytesToHex(this.ins[index].script.buffer)};
      }
    } else {
      return false;
    }
  }

  /* generate a signature from a transaction hash */
  r.transactionSig = function(index, wif, sigHashType, txhash){

    function serializeSig(r, s) {
      var rBa = r.toByteArraySigned();
      var sBa = s.toByteArraySigned();

      var sequence = [];
      sequence.push(0x02); // INTEGER
      sequence.push(rBa.length);
      sequence = sequence.concat(rBa);

      sequence.push(0x02); // INTEGER
      sequence.push(sBa.length);
      sequence = sequence.concat(sBa);

      sequence.unshift(sequence.length);
      sequence.unshift(0x30); // SEQUENCE

      return sequence;
    }

    var shType = sigHashType || 1;

    if (coinjs.shf == 0x40) {
      /* Add SIGHASH_FORKID by default for Bitcoin Cash */
      shType = shType | 0x40;
    }

    var hash = txhash || Crypto.util.hexToBytes(this.transactionHash(index, shType));
    {
      //if (txhash == undefined) {
      //  console.log(txhash);
      //  console.log("txhashsig:", this.transactionHash(index, shType));
      //}
    }

    if(hash){
      var curve = EllipticCurve.getSECCurveByName("secp256k1");
      var key = coinjs.wif2privkey(wif);
      var priv = BigInteger.fromByteArrayUnsigned(Crypto.util.hexToBytes(key['privkey']));
      var n = curve.getN();
      var e = BigInteger.fromByteArrayUnsigned(hash);
      var badrs = 0
      do {
        var k = this.deterministicK(wif, hash, badrs);
        var G = curve.getG();
        var Q = G.multiply(k);
        var r = Q.getX().toBigInteger().mod(n);
        var s = k.modInverse(n).multiply(e.add(priv.multiply(r))).mod(n);
        badrs++
      } while (r.compareTo(BigInteger.ZERO) <= 0 || s.compareTo(BigInteger.ZERO) <= 0);

      // Force lower s values per BIP62
      var halfn = n.shiftRight(1);
      if (s.compareTo(halfn) > 0) {
        s = n.subtract(s);
      };

      var sig = serializeSig(r, s);
      sig.push(parseInt(shType, 10));

      return Crypto.util.bytesToHex(sig);
    } else {
      return false;
    }
  }

  // https://tools.ietf.org/html/rfc6979#section-3.2
  r.deterministicK = function(wif, hash, badrs) {
    // if r or s were invalid when this function was used in signing,
    // we do not want to actually compute r, s here for efficiency, so,
    // we can increment badrs. explained at end of RFC 6979 section 3.2

    // wif is b58check encoded wif privkey.
    // hash is byte array of transaction digest.
    // badrs is used only if the k resulted in bad r or s.

    // some necessary things out of the way for clarity.
    badrs = badrs || 0;
    var key = coinjs.wif2privkey(wif);
    var x = Crypto.util.hexToBytes(key['privkey'])
    var curve = EllipticCurve.getSECCurveByName("secp256k1");
    var N = curve.getN();

    // Step: a
    // hash is a byteArray of the message digest. so h1 == hash in our case

    // Step: b
    var v = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

    // Step: c
    var k = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    // Step: d
    k = Crypto.HMAC(Crypto.SHA256, v.concat([0]).concat(x).concat(hash), k, { asBytes: true });

    // Step: e
    v = Crypto.HMAC(Crypto.SHA256, v, k, { asBytes: true });

    // Step: f
    k = Crypto.HMAC(Crypto.SHA256, v.concat([1]).concat(x).concat(hash), k, { asBytes: true });

    // Step: g
    v = Crypto.HMAC(Crypto.SHA256, v, k, { asBytes: true });

    // Step: h1
    var T = [];

    // Step: h2 (since we know tlen = qlen, just copy v to T.)
    v = Crypto.HMAC(Crypto.SHA256, v, k, { asBytes: true });
    T = v;

    // Step: h3
    var KBigInt = BigInteger.fromByteArrayUnsigned(T);

    // loop if KBigInt is not in the range of [1, N-1] or if badrs needs incrementing.
    var i = 0
    while (KBigInt.compareTo(N) >= 0 || KBigInt.compareTo(BigInteger.ZERO) <= 0 || i < badrs) {
      k = Crypto.HMAC(Crypto.SHA256, v.concat([0]), k, { asBytes: true });
      v = Crypto.HMAC(Crypto.SHA256, v, k, { asBytes: true });
      v = Crypto.HMAC(Crypto.SHA256, v, k, { asBytes: true });
      T = v;
      KBigInt = BigInteger.fromByteArrayUnsigned(T);
      i++
    };

    return KBigInt;
  };

  /* serialize a transaction */
  r.serialize = function(){
    var buffer = [];
    buffer = buffer.concat(coinjs.numToBytes(parseInt(this.version),4));

    if(this.witness.length>=1){
      buffer = buffer.concat([0x00, 0x01]);
    }

    if (coinjs.txExtraTimeField) {
      buffer = buffer.concat(coinjs.numToBytes(parseInt(this.nTime),4));
    }

    buffer = buffer.concat(coinjs.numToVarInt(this.ins.length));
    for (var i = 0; i < this.ins.length; i++) {
      var txin = this.ins[i];
      buffer = buffer.concat(Crypto.util.hexToBytes(txin.outpoint.hash).reverse());
      buffer = buffer.concat(coinjs.numToBytes(parseInt(txin.outpoint.index),4));
      var scriptBytes = txin.script.buffer;
      buffer = buffer.concat(coinjs.numToVarInt(scriptBytes.length));
      buffer = buffer.concat(scriptBytes);
      buffer = buffer.concat(coinjs.numToBytes(parseInt(txin.sequence),4));
    }
    buffer = buffer.concat(coinjs.numToVarInt(this.outs.length));

    for (var i = 0; i < this.outs.length; i++) {
      var txout = this.outs[i];
        buffer = buffer.concat(coinjs.numToBytes(txout.value,8));
      var scriptBytes = txout.script.buffer;
      buffer = buffer.concat(coinjs.numToVarInt(scriptBytes.length));
      buffer = buffer.concat(scriptBytes);
    }

    if(this.witness.length>=1){
      for(var i = 0; i < this.witness.length; i++){
         buffer = buffer.concat(coinjs.numToVarInt(this.witness[i].length));
        for(var x = 0; x < this.witness[i].length; x++){
           buffer = buffer.concat(coinjs.numToVarInt(Crypto.util.hexToBytes(this.witness[i][x]).length));
          buffer = buffer.concat(Crypto.util.hexToBytes(this.witness[i][x]));
        }
      }
    }

    buffer = buffer.concat(coinjs.numToBytes(parseInt(this.lock_time),4));
    return Crypto.util.bytesToHex(buffer);
  }

  /* deserialize a transaction */
  r.deserialize = function(buffer){
    if (typeof buffer == "string") {
      buffer = Crypto.util.hexToBytes(buffer)
    }

    var pos = 0;
    var witness = false;

    var readAsInt = function(bytes) {
      if (bytes == 0) return 0;
      pos++;
      return buffer[pos-1] + readAsInt(bytes-1) * 256;
    }

    var readVarInt = function() {
      pos++;
      if (buffer[pos-1] < 253) {
        return buffer[pos-1];
      }
      return readAsInt(buffer[pos-1] - 251);
    }

    var readBytes = function(bytes) {
      pos += bytes;
      return buffer.slice(pos - bytes, pos);
    }

    var readVarString = function() {
      var size = readVarInt();
      return readBytes(size);
    }

    var obj = new coinjs.transaction();
    obj.version = readAsInt(4);

    if (coinjs.txExtraTimeField) {
      obj.nTime = readAsInt(4);
    }

    if(buffer[pos] == 0x00 && buffer[pos+1] == 0x01){
      // segwit transaction
      witness = true;
      obj.witness = [];
      pos += 2;
    }

    var ins = readVarInt();
    for (var i = 0; i < ins; i++) {
      obj.ins.push({
        outpoint: {
          hash: Crypto.util.bytesToHex(readBytes(32).reverse()),
            index: readAsInt(4)
        },
        script: coinjs.script(readVarString()),
        sequence: readAsInt(4)
      });
    }

    var outs = readVarInt();
    for (var i = 0; i < outs; i++) {
      obj.outs.push({
        value: coinjs.bytesToNum(readBytes(8)),
        script: coinjs.script(readVarString())
      });
    }

    if(witness == true){
      for (i = 0; i < ins; ++i) {
        var count = readVarInt();
        var vector = [];
        for(var y = 0; y < count; y++){
          var slice = readVarInt();
          pos += slice;
          if(!coinjs.isArray(obj.witness[i])){
            obj.witness[i] = [];
          }
          obj.witness[i].push(Crypto.util.bytesToHex(buffer.slice(pos - slice, pos)));
        }
      }
    }

    obj.lock_time = readAsInt(4);
    return obj;
  }

  r.size = function(){
    return ((this.serialize()).length/2).toFixed(0);
  }

  return r;
}

coinjs.countObject = function(obj){
  var count = 0;
  var i;
  for (i in obj) {
    if (obj.hasOwnProperty(i)) {
      count++;
    }
  }
  return count;
}

/* clone an object */
coinjs.clone = function(obj) {
  if(obj == null || typeof(obj) != 'object') return obj;
  var temp = new obj.constructor();

  for(var key in obj) {
    if(obj.hasOwnProperty(key)) {
      temp[key] = coinjs.clone(obj[key]);
    }
  }
  return temp;
}

coinjs.numToBytes = function(num,bytes) {
  if (typeof bytes === "undefined") bytes = 8;
  if (bytes == 0) {
    return [];
  } else if (num == -1){
    return Crypto.util.hexToBytes("ffffffffffffffff");
  } else {
    return [num % 256].concat(coinjs.numToBytes(Math.floor(num / 256),bytes-1));
  }
}

coinjs.numToByteArray = function(num) {
  if (num <= 256) {
    return [num];
  } else {
    return [num % 256].concat(coinjs.numToByteArray(Math.floor(num / 256)));
  }
}

coinjs.numToVarInt = function(num) {
  if (num < 253) {
    return [num];
  } else if (num < 65536) {
    return [253].concat(coinjs.numToBytes(num,2));
  } else if (num < 4294967296) {
    return [254].concat(coinjs.numToBytes(num,4));
  } else {
    return [255].concat(coinjs.numToBytes(num,8));
  }
}

coinjs.bytesToNum = function(bytes) {
  if (bytes.length == 0) return 0;
  else return bytes[0] + 256 * coinjs.bytesToNum(bytes.slice(1));
}

/* decode or validate an address and return the hash */
coinjs.addressDecode = function(addr) {
  try {

    if (coinjs.base32pref != "") {
      if (!addr.startsWith(coinjs.base32pref+":")) {
        return false;
      }
      let bytes = decodeBase32AsBytes(addr.slice(coinjs.base32pref.length+1));
      if (bytes == false) {
        return false;
      }
      var front = bytes;

      var o = {};

      if (bytes[0] == 0) { // standard address
        o.type = 'standard';
        o.bytes = front.slice(1);
        o.version = [front[0]];

      } else if (bytes[0] == 8) { // multisig address
        o.type = 'multisig';
        o.bytes = front.slice(1);
        o.version = [front[0]];

      } else { // everything else
        o.type = 'other'; // address is still valid but unknown version
        o.bytes = front.slice(1);
        o.version = [front[0]];
      }

      return o;
    }

    var bytes = coinjs.base58decode(addr);
    var front = bytes.slice(0, bytes.length-4);
    var back = bytes.slice(bytes.length-4);
    var checksum = Crypto.SHA256(Crypto.SHA256(front, {asBytes: true}), {asBytes: true}).slice(0, 4);
    if (checksum+"" == back+"") {

      var o = {};
      //console.log(front.slice(0, coinjs.multisig.length),coinjs.multisig, coinjs.arrayEquals(front.slice(coinjs.multisig.length),coinjs.multisig));

      if (coinjs.arrayEquals(front.slice(0, coinjs.pub.length),coinjs.pub)) { // standard address
        o.type = 'standard';
        o.bytes = front.slice(coinjs.pub.length);
        o.version = front.slice(0, coinjs.pub.length);

      } else if (coinjs.arrayEquals(front.slice(0, coinjs.multisig.length),coinjs.multisig)) { // multisig address
        o.type = 'multisig';
        o.bytes = front.slice(coinjs.multisig.length);
        o.version = front.slice(0, coinjs.multisig.length);

      } else if (coinjs.arrayEquals(front.slice(0, coinjs.priv.length),coinjs.priv)){ // wifkey
        o.type = 'wifkey';
        o.bytes = front.slice(coinjs.priv.length);
        o.version = front.slice(0, coinjs.priv.length);

      } else { // everything else
        o.type = 'other'; // address is still valid but unknown version
        o.bytes = front.slice(1);
        o.version = [front[0]];
      }

      return o;
    } else {
      return false;
    }
  } catch(e) {

    bech32rs = coinjs.bech32redeemscript(addr);
    if(bech32rs){
      return {'type':'bech32', 'redeemscript':bech32rs};
    } else {
      return false;
    }

    return false;
  }
}

/* base58 encode function */
coinjs.base58encode = function(buffer) {
  var alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  var base = BigInteger.valueOf(58);

  var bi = BigInteger.fromByteArrayUnsigned(buffer);
  var chars = [];

  while (bi.compareTo(base) >= 0) {
    var mod = bi.mod(base);
    chars.unshift(alphabet[mod.intValue()]);
    bi = bi.subtract(mod).divide(base);
  }

  chars.unshift(alphabet[bi.intValue()]);
  for (var i = 0; i < buffer.length; i++) {
    if (buffer[i] == 0x00) {
      chars.unshift(alphabet[0]);
    } else break;
  }
  return chars.join('');
}

/* base58 decode function */
coinjs.base58decode = function(buffer){
  var alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  var base = BigInteger.valueOf(58);
  var validRegex = /^[1-9A-HJ-NP-Za-km-z]+$/;

  var bi = BigInteger.valueOf(0);
  var leadingZerosNum = 0;
  for (var i = buffer.length - 1; i >= 0; i--) {
    var alphaIndex = alphabet.indexOf(buffer[i]);
    if (alphaIndex < 0) {
      throw "Invalid character";
    }
    bi = bi.add(BigInteger.valueOf(alphaIndex).multiply(base.pow(buffer.length - 1 - i)));

    if (buffer[i] == "1") leadingZerosNum++;
    else leadingZerosNum = 0;
  }

  var bytes = bi.toByteArrayUnsigned();
  while (leadingZerosNum-- > 0) bytes.unshift(0);
  return bytes;
}

coinjs.privkey2wif = function(h){
  var r = Crypto.util.hexToBytes(h);

  if(coinjs.compressed==true){
    r.push(0x01);
  }

  r.unshift(...coinjs.priv);
  var hash = Crypto.SHA256(Crypto.SHA256(r, {asBytes: true}), {asBytes: true});
  var checksum = hash.slice(0, 4);

  return coinjs.base58encode(r.concat(checksum));
}

/* convert a wif key back to a private key */
coinjs.wif2privkey = function(wif){
  var compressed = false;
  var decode = coinjs.base58decode(wif);
  var key = decode.slice(0, decode.length-4);
  key = key.slice(1, key.length);
  if(key.length>=33 && key[key.length-1]==0x01){
    key = key.slice(0, key.length-1);
    compressed = true;
  }
  return {'privkey': Crypto.util.bytesToHex(key), 'compressed':compressed};
}

/* new multisig address, provide the two pubkeys AND locktimes to release the funds */
coinjs.pubkeys2MultisigAddressWithBackup = function(upubkey1, upubkey2, locktime1, locktime2) {
  var s = coinjs.script();
  if (locktime1 == 0 && locktime2 == 0) {
    s.writeOp(82); //OP_1(2)
    s.writeBytes(Crypto.util.hexToBytes(upubkey1));
    s.writeBytes(Crypto.util.hexToBytes(upubkey2));
    s.writeOp(82); //OP_1(2)
    s.writeOp(174); //OP_CHECKMULTISIG
  }
  else {
    s.writeOp(99); //OP_IF
    {
      s.writeOp(82); //OP_1(2)
      s.writeBytes(Crypto.util.hexToBytes(upubkey1));
      s.writeBytes(Crypto.util.hexToBytes(upubkey2));
      s.writeOp(82); //OP_1(2)
      s.writeOp(174); //OP_CHECKMULTISIG
    }
    s.writeOp(103); //OP_ELSE
    {
      s.writeOp(99); //OP_IF
      {
        s.writeBytes(coinjs.numToByteArray(locktime1));
        s.writeOp(177);//OP_CHECKLOCKTIMEVERIFY
        s.writeOp(117);//OP_DROP
        s.writeBytes(Crypto.util.hexToBytes(upubkey1));
        s.writeOp(172);//OP_CHECKSIG
      }
      s.writeOp(103); //OP_ELSE
      {
        s.writeBytes(coinjs.numToByteArray(locktime2));
        s.writeOp(177);//OP_CHECKLOCKTIMEVERIFY
        s.writeOp(117);//OP_DROP
        s.writeBytes(Crypto.util.hexToBytes(upubkey2));
        s.writeOp(172);//OP_CHECKSIG
      }
      s.writeOp(104); //OP_ENDIF
    }
    s.writeOp(104); //OP_ENDIF
  }
  let x = ripemd160(Crypto.SHA256(s.buffer, {asBytes: true}), {asBytes: true});
  if (coinjs.base32pref != "") {
    let encver = 8; // 1 << 3
    let encsize = (x.length - 20)/4;
    let enc = encver + encsize;
    x.unshift(enc);
    let redeemScript = Crypto.util.bytesToHex(s.buffer);
    let address = coinjs.base32pref+":"+encodeBytesToBase32(x);
    return {'address':address, 'redeemScript':redeemScript};
  }
  x.unshift(...coinjs.multisig);
  let r = x;
  r = Crypto.SHA256(Crypto.SHA256(r, {asBytes: true}), {asBytes: true});
  let checksum = r.slice(0,4);
  let redeemScript = Crypto.util.bytesToHex(s.buffer);
  let address = coinjs.base58encode(x.concat(checksum));
  return {'address':address, 'redeemScript':redeemScript};
}

/* decompress an compressed public key */
coinjs.pubkeydecompress = function(pubkey) {
  if((typeof(pubkey) == 'string') && pubkey.match(/^[a-f0-9]+$/i)){
    var curve = EllipticCurve.getSECCurveByName("secp256k1");
    try {
      var pt = curve.curve.decodePointHex(pubkey);
      var x = pt.getX().toBigInteger();
      var y = pt.getY().toBigInteger();

      var publicKeyBytes = EllipticCurve.integerToBytes(x, 32);
      publicKeyBytes = publicKeyBytes.concat(EllipticCurve.integerToBytes(y,32));
      publicKeyBytes.unshift(0x04);
      return Crypto.util.bytesToHex(publicKeyBytes);
    } catch (e) {
      // console.log(e);
      return false;
    }
  }
  return false;
}

/* provide a public key and return address */
coinjs.pubkey2address = function(h, byte){
  var r = ripemd160(Crypto.SHA256(Crypto.util.hexToBytes(h), {asBytes: true}));
  r.unshift(byte || coinjs.pub);
  var hash = Crypto.SHA256(Crypto.SHA256(r, {asBytes: true}), {asBytes: true});
  var checksum = hash.slice(0, 4);
  return coinjs.base58encode(r.concat(checksum));
}

coinjs.verifySignature = function (hash, sig, pubkey) {

  function parseSig (sig) {
    var cursor;
    if (sig[0] != 0x30)
      throw new Error("Signature not a valid DERSequence");

    cursor = 2;
    if (sig[cursor] != 0x02)
      throw new Error("First element in signature must be a DERInteger"); ;

    var rBa = sig.slice(cursor + 2, cursor + 2 + sig[cursor + 1]);

    cursor += 2 + sig[cursor + 1];
    if (sig[cursor] != 0x02)
      throw new Error("Second element in signature must be a DERInteger");

    var sBa = sig.slice(cursor + 2, cursor + 2 + sig[cursor + 1]);

    cursor += 2 + sig[cursor + 1];

    var r = BigInteger.fromByteArrayUnsigned(rBa);
    var s = BigInteger.fromByteArrayUnsigned(sBa);

    return { r: r, s: s };
  }

  var r, s;

  if (coinjs.isArray(sig)) {
    var obj = parseSig(sig);
    r = obj.r;
    s = obj.s;
  } else if ("object" === typeof sig && sig.r && sig.s) {
    r = sig.r;
    s = sig.s;
  } else {
    throw "Invalid value for signature";
  }

  var Q;
  if (coinjs.isArray(pubkey)) {
    var ecparams = EllipticCurve.getSECCurveByName("secp256k1");
    Q = EllipticCurve.PointFp.decodeFrom(ecparams.getCurve(), pubkey);
  } else {
    throw "Invalid format for pubkey value, must be byte array";
  }
  var e = BigInteger.fromByteArrayUnsigned(hash);

  return coinjs.verifySignatureRaw(e, r, s, Q);
}

coinjs.verifySignatureRaw = function (e, r, s, Q) {
  var ecparams = EllipticCurve.getSECCurveByName("secp256k1");
  var n = ecparams.getN();
  var G = ecparams.getG();

  if (r.compareTo(BigInteger.ONE) < 0 || r.compareTo(n) >= 0)
    return false;

  if (s.compareTo(BigInteger.ONE) < 0 || s.compareTo(n) >= 0)
    return false;

  var c = s.modInverse(n);

  var u1 = e.multiply(c).mod(n);
  var u2 = r.multiply(c).mod(n);

  var point = G.multiply(u1).add(Q.multiply(u2));

  var v = point.getX().toBigInteger().mod(n);

  return v.equals(r);
}


// ws

});
