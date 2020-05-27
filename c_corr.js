const { db } = require("@arangodb");
const queues = require("@arangodb/foxx/queues");
const run_script = queues.get("b_upd");
console.log("start c_corr 1")
const pre = db._query(`
for com in commandment
    filter com.upd == true 
    for x in commandment_corr
        filter x._from == com._id
        remove {_key : x._key } in commandment_corr
        return true`).toArray()
console.log("start c_corr 2")
const p10 = db._query(`
for com in commandment
    filter com.upd == true 
    FOR p IN 1..1 OUTBOUND com._id inboard 
        FOR c IN 1..1 INBOUND p._id inboard 
            filter c._id != com._id
            UPSERT { _from: com._id , _to: c._id}
                INSERT { _from: com._id , _to: c._id, corr: 10}
                UPDATE {corr : OLD.corr + 10 }
            IN commandment_corr  
            RETURN true`
        ).toArray() 
const p1 = db._query(`
for com in commandment
    filter com.upd
    FOR g IN 2..2 OUTBOUND com._id inboard 
        FOR c IN 2..2 INBOUND g._id inboard 
            filter c._id != com._id
            UPSERT { _from: com._id , _to: c._id}
                INSERT { _from: com._id , _to: c._id, corr: 1}
                UPDATE {corr : OLD.corr + 1 }
            IN commandment_corr  
        RETURN true`
        ).toArray() 
console.log("start c_corr 3")
const boards = db._query(`
for com in commandment
    filter com.upd == true 
    for p in inboard 
        filter p._from == com._id
        update {_key: SPLIT( p._to,"/")[1] , upd :true} in board
        return true`).toArray()
console.log("start c_corr 4")
const second = db._query(`
for com in commandment
    filter com.upd == true 
    update {_key : com._key, upd: false } in commandment
    return true `).toArray()
console.log("start c_corr 5")
run_script.push(
    {
      mount: module.context.mount, 
      name: "b_corr"
    },{})

console.log("end c_corr")
//TODO: feed the second query with the output of the first        
