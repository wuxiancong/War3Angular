const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: '127.0.0.1',
  user: 'pvpgn',
  password: '',
  database: 'pvpgn'
});

connection.query('SHOW TABLES', (err, results, fields) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(results);
  process.exit(0);
});
