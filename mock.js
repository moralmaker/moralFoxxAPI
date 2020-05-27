const { db } = require("@arangodb");
const queues = require("@arangodb/foxx/queues");
const run_script = queues.get("c_upd");
console.log("mock boards")

const clear =db._query(`
    let x1 = (for x in commandment_corr remove x in commandment_corr )
    let x2 = (for x in board_corr remove x in board_corr )    
    let x3 = (for x in inboard
                 filter x.mock == true
                 remove x in inboard )
    let x4 = (for x in board
                 filter x.mock == true
                 remove x in board )
    let x5 = (for x in commandment
                 filter x.mock == true
                 remove x in commandment ) 
    return true                 
    `)
const pboards =db._query(`
    for i in 1..500
        insert {_key: CONCAT('mockp', i), name: concat('mock_g:',i), of : concat('mock_g:',i), upd: true, mock: true} into board
        return i
    `)
const gboards =db._query(`
    for i in 1..100
        insert {_key: concat('mockg:',i), name: concat('mock_g:',i),  mock: true} into board
        return i
    `)
console.log("mock commandment")
const commandments = db._query(`
    for i in 1..1000
        insert {_key: concat('mock:',i), text: concat('mock:',i), support: 0, unsupport: 0, upd: true,   mock: true} into commandment
        return i
    `)

console.log("mock inboard 900")
for (var i =0;i < 900; i++) {
    const { cid,bid } = db._query(`   
            let bid = (FOR b IN board
                filter has(b,"of")
                let count = (FOR y IN 1..1 INBOUND b._id inboard 
                            COLLECT WITH COUNT INTO length
                            RETURN length)
                filter count[0] < 5            
                SORT RAND()
                LIMIT 1
                RETURN b._id)[0]
            let cid = (FOR c IN commandment
                SORT RAND()
                LIMIT 1
                RETURN c._id)[0]
            return {cid:cid, bid:bid}`).toArray()[0] 

    let exists = db._query(`for x in inboard filter x._from == "${cid}" && x._to == "${bid}" return x`).toArray()[0]  
    if(exists) continue
    //let upd = db._query(`update { _key: SPLIT( "${cid}" ,"/")[1] , upd: true} in commandment`).toArray()  
    let ins = db._query(`insert {_from: "${cid}", _to: "${bid}", mock: true} into inboard`).toArray()              
}

console.log("run c_corr")


run_script.push(
    {
      mount: module.context.mount, 
      name: "c_corr"
    },{})

console.log("end mock")
//TODO: feed the second query with the output of the first        
