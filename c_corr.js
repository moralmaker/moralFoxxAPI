const { db } = require("@arangodb");
const queues = require("@arangodb/foxx/queues");
const run_script = queues.get("b_upd");
console.log("start c_corr")
const pre = db._query(`
for com in commandment
    filter com.upd == true 
    for x in commandment_corr
        filter x._from == com._id
        remove {_key : x._key } in commandment_corr
        return true`).toArray()

const first = db._query(`
for com in commandment
    filter com.upd == true 
    for p in inboard 
        filter p._from == com._id
        for g in inboard
            filter g._to == p._to && g._from != p._id 
            UPSERT { _from: com._id , _to: g._from}
                INSERT { _from: com._id , _to: g._from, corr: 10}
                UPDATE {corr : OLD.corr + 10 }
            IN commandment_corr  
            RETURN g`
        ).toArray() 

const boards = db._query(`
for com in commandment
    filter com.upd == true 
    for p in inboard 
        filter p._from == com._id
        update {_key: p._to, upd :true} in board`).toArray()

const second = db._query(`
for com in commandment
    filter com.upd == true 
    update {_key : com._key, upd: false } in commandment `).toArray()

run_script.push(
    {
      mount: module.context.mount, 
      name: "b_corr"
    },{})

console.log("end c_corr")
//TODO: feed the second query with the output of the first        
