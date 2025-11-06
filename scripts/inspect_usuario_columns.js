(async ()=>{
  try{
    const { pool } = require('../db');
    const [rows] = await pool.query("SELECT COLUMN_NAME,COLUMN_TYPE,CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuario'");
    console.log(JSON.stringify(rows,null,2));
    process.exit(0);
  }catch(e){
    console.error(e);
    process.exit(1);
  }
})();
