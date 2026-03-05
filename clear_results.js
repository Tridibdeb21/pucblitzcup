const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'blitz.db'));

db.serialize(() => {
  db.run('DELETE FROM results', function(err) {
    if (err) return console.error('error clearing results:', err.message);
    console.log('cleared', this.changes, 'rows');
    db.close();
  });
});
