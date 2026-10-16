'use strict';
const net=require('node:net');
function privateIPv4(ip){if(net.isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return a===10||a===127||(a===192&&b===168)||(a===172&&b>=16&&b<=31)||(a===169&&b===254&&ip!=='169.254.169.254');}
module.exports={privateIPv4};
