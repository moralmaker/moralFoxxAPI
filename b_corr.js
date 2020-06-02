const { db } = require("@arangodb");
console.log("start b_corr")
const bc = db._query(`
    for personal in pboard
    filter personal.upd == true 
    LET pcom = (
        FOR com1 IN 1..1 INBOUND personal._id inboard
            RETURN com1
        )
        filter pcom != []

    FOR com in pcom
        filter com.upd == true

        FOR b IN 1..1 OUTBOUND com._id inboard 
            filter b._id != personal._id
        
            LET bcom = (
            FOR com2 IN 1..1 INBOUND b._id inboard
                RETURN com2
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
     
            return ({from : personal._id , to: b._id, score: score[0]})    
    `).toArray()


for(i=0 ;i < bc.length ;i++) {
//console.log("lll:",bc[i])
 db._query(`
                UPSERT { _from: '${bc[i].from}' , _to:  '${bc[i].to}'}
                    INSERT { _from: '${bc[i].from}' , _to: '${bc[i].to}' ,corr : ${bc[i].score} }
                    UPDATE {corr : ${bc[i].score} }
                IN board_corr  
                `
            )     

}
/*
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
        */
console.log("middle b_corr")

const clean1 = db._query(`
for c in commandment
    filter c.upd == true 
    update {_key : c._key, upd: false } in commandment
    return true`).toArray()
const clean2 = db._query(`
for personal in pboard
    filter personal.upd == true 
    update {_key : personal._key, upd: false } in pboard
    return true`).toArray()

console.log("end b_corr")
//TODO: feed the second query with the output of the first        
