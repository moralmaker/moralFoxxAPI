const { db } = require("@arangodb");
console.log("start b_corr")
const first = db._query(`
for personal in board
    filter personal.upd == true 
    LET pcom = (
        FOR com IN 1..1 INBOUND personal._id inboard
            RETURN com
        )
        filter pcom != []
    for b in board
        filter HAS(b,"of") && b._id != personal._id
        
        LET bcom = (
        FOR com IN 1..1 INBOUND b._id inboard
            RETURN com
        )
        filter bcom != []
        
        LET score = (
            for pc in pcom
                for bc in bcom
                    for corr in commandment_corr
                    filter corr._from == pc._id && corr._to == bc._id
                    COLLECT AGGREGATE sc = sum(corr.corr)
                    return sc
                     
        )
        filter score[0] >  0 
        UPSERT { _from : personal._id , _to: b._id } 
        INSERT { _from : personal._id , _to: b._id, corr: score} 
        UPDATE { corr: score } IN board_corr        
        return ({_from : personal._id , _to: b._id, pcom : pcom , bcom : bcom, score: score})`
        ).toArray() 

const second = db._query(`
for personal in board
    filter personal.upd == true 
    update {_key : personal._key, upd: false } in board`).toArray()

console.log("end b_corr")
//TODO: feed the second query with the output of the first        
