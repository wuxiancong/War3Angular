const crypto = require('crypto');
const strings = ['wuxiancong', 'wuxiancong16', 'WUXIANCONG', 'WUXIANCONG16'];
strings.forEach(s => {
    console.log(`${s}: ${crypto.createHash('sha1').update(s).digest('hex')}`);
});
