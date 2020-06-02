  "use strict";

  const createRouter = require('@arangodb/foxx/router');
  const router = createRouter();
  module.context.use(router);  

  const queues = require("@arangodb/foxx/queues");
  const run_script = queues.create("c_upd");  

  // include console module so we can log something (in the server's log)
  var console = require("console");
  var ArangoError = require("@arangodb").ArangoError;

  // we also need this module for custom responses
  var actions = require("@arangodb/actions");

  // use joi for validation 
  var joi = require("joi");
  const { db, query } = require("@arangodb");
  
/*  const getBoard = (uid) =>  db._query(`FOR v,e,p IN 1..1 OUTBOUND users/@uid onboard 
                FILTER p.edges[*].personal ALL == true
                RETURN v._id`,{uid: uid}).toArray();
*/
  const filter = (obj)=> {
    if(typeof obj !== 'object' || obj == null || Object.keys(obj).length === 0) return '';
    delete obj[""]
    const enclose = (x) => x === 'true' || x === 'false' ? "" : "'"
    const aql =  Object.keys(obj).reduce((o,x)=> `${o}${(o !== 'filter' ? 'and ' : ' ')}u.${x}==${enclose(obj[x])}${obj[x]}${enclose(obj[x])} `,'filter')
    console.log("AQL:",aql,obj)
    return aql
  };

  const AQLPersOnalboard = (id) => `for p in pboard filter p._key == "${id}"
                                          for c in inbound p._id inboard
  RETURN {board : {id: p._id, name : p.name}, commandment : {id: c._id, text: c.text, author: c.author}}`;

  const AQLPersOnalonlyBoard = (id) => `FOR p IN pboard filter p._key == "${id}" RETURN {board : {id: p._id, name : p.name}}`;

 module.context.use(function auth(req, res, next) {
    let obj = !req.rawBody ? req.queryParams : req.rawBody
    obj = !req.rawBody ? obj : JSON.parse(req.rawBody)
    let { uid } =  obj
    console.log("Auth middleWare: ",obj,req.path)
    if (req.path == '/signup') next() 
    if (!uid) {
      const err = new Error('Needs user id');
      next(err) 
    }   
    uid = uid || {}
    const user = db._query(`FOR u IN pboard FILTER u._key == @uid return u`,{uid : uid}).toArray()    
    const isAuth = user[0] ? true : false   
      if (!isAuth)  {
        res.send('Not authenticated');
        return
      } 
    next();
  })


  router.post('/addc', function (req, res) {
    const newC =  req.body    
    const {commandment, boardid, uid } = newC 
    console.log("DEKLTE ME:",boardid)  
    if (commandment) {
      const aql = `FOR v IN pboard filter v._key == '${uid}' 
                for x in inbound v._id inboard
                    COLLECT WITH COUNT INTO length
                RETURN length`
      const count = db._query(aql).toArray();      
      if (count < 5) {
        const exists = db._query(`for c in commandment filter c.text == "${commandment}" return c`).toArray()
        const com = exists[0] ? exists[0]  : db._collection('commandment').save({text: commandment, active: false, support: 1, unsupport: 0, usedby : 1})
        const I = db._collection('inboard').save({_from: com._id, _to: boardid})

        const aql1 = `FOR c IN 1..1 INBOUND @_to inboard 
                      update { _key: SPLIT( c._id ,"/")[1], upd : true } in commandment `      
        const xx2 = db._query(aql1,{ _to: boardid }).toArray()          
        //const c_key = (com._id).split('/')[1]
        //const xxx = db._query(`update { _key:@_key, upd : true } in commandment`,{_key:c_key }).toArray()   
        res.json({ text : 'good' })
        run_script.push(
            {
              mount: module.context.mount, 
              name: "c_corr"
            },{})
      }else {
        res.throw(400, "there are allready 5 commandments in the board");
      }  
    }else{
      res.throw(400, "There is no Commandment");
    }
  })
  .summary("Add New Commandment")
  .body(
    joi.object().required(),
    'This implies JSON.'
  ); 

  router.post('/addec', function (req, res) {
    const {cid, uid } = req.body
    console.log("0:  ",  req.body) 
    const aql = `for x in pboard  filter x._key == '${uid}'
                  let count = (FOR y IN 1..1 INBOUND x._to inboard 
                    COLLECT WITH COUNT INTO length
                    RETURN length)
                  return {boardId : x._to, count : count}`
     console.log("Count1:  ",aql)  
    const {boardId, count} = db._query(aql).toArray()[0]   
           console.log("Count2:  ",boardId,count[0]) 
    if (cid && boardId) {
      if(count[0] < 5) {
        const I = db._collection('inboard').save({_from: cid, _to: boardId}) 

        const aql1 = `FOR c IN 1..1 INBOUND @_to inboard 
                      update { _key: SPLIT( c._id ,"/")[1], upd : true } in commandment `      
        const xx2 = db._query(aql1,{ _to: boardId }).toArray()        
        //const _key = cid.split('/')[1]
        //console.log('_key',_key)
        //const xxx = db._query(`update { _key:@_key, upd : true } in commandment`,{_key: _key }).toArray()  
        run_script.push(
          {
            mount: module.context.mount, 
            name: "c_corr"
          },{})
        res.json({ added : xxx })
      }else{
        res.throw(400, "There are alrredy 5 commandments on the personal board.");
      } 
    }else{
      res.throw(400, "There is no Commandment");
    }
  })
  .summary("Add Existing Commandment to Board")
  .body(
    joi.object().required(),
    'This implies JSON.'
  );   

  router.post('/removec', function (req, res) {
    const newC =  req.body     
    const { _from, _to } = newC   
    if (_from && _to) {
 
      const aql1 = `FOR c IN 1..1 INBOUND @_to inboard 
                      update { _key: SPLIT( c._id ,"/")[1], upd : true } in commandment `      

      const aql2 = `FOR u IN inboard
                filter u._from == @_from
                and u._to == @_to
                remove u in inboard            
                return OLD`               

      const xx2 = db._query(aql1,{ _to: _to }).toArray()                 
      const xxx = db._query(aql2,{ _from: _from ,_to : _to  }).toArray()  

//      const xxx = db._query(`FOR u IN inboard filter u._from == @_from and u._to == @_to remove u in inboard return OLD`,{_from: _from ,_to : _to }).toArray()  
      const count = db._query(`for c in inboard filter c._from == @_from
                                COLLECT WITH COUNT INTO cnt
                                return cnt`,{_from: _from}).toArray()      
      if (count && (count[0] <= 0)) db._query(`FOR u IN commandment filter u._id == @_from and u.noDelete != true remove u in commandment return OLD`,{_from: _from })

      run_script.push(
          {
            mount: module.context.mount, 
            name: "c_corr"
          },{})  

      res.json({ removed : xxx })
    }else{
      res.throw(400, "Error in REMOVE commandment");
    }
  })
  .summary("Remove Commandment")
  .body(
    joi.object().required(),
    'This implies JSON.'
  );

router.post('/addb', function (req, res) {
    const { name, latitude, longitude, radius, uid } = req.body
    console.log("0:  ",  req.body) 
    const aql = `for x in pboard filter x._key == '${uid}'
                  let c = (FOR y IN 1..1 OUTBOUND x._id inboard 
                            COLLECT WITH COUNT INTO length
                            RETURN length)
                  return {personal : x, count : c}`
     console.log("Count1:  ",aql)              
    if (name && latitude && longitude && radius && uid) {
      const {personal, count} = db._query(aql).toArray()[0];
      console.log("Count:  ",count[0], name, latitude, longitude, radius, uid)    
      if(count[0] < 5 ) {
        const newBoard = db._collection('gboard').save(
          
        {
          name,
          members: 1,
          location : {
            type : 'Point',
            'coordinates' : [latitude,longitude]
          },
          radius,
        })
       console.log("2222:   ",newBoard) 
      db._collection('inboard').save(
        {
          _from: personal._to,
          _to: newBoard._id
        })
      }else {
        res.throw(400, "there are allready 5 public boards for this user");
      }  
    }else{
      res.throw(400, "Error in NewBoard");
    }
  })
  .summary("Add New Board")
  .body(
    joi.object().required(),
    'This implies JSON.'
  );  

  router.post('/gob', function (req, res) {  
    const { boardId, uid } = req.body   
    const aql = `for x in pboard filter x._key == '${uid}'
                  let c = (FOR y IN 1..1 OUTBOUND x._id inboard 
                            COLLECT WITH COUNT INTO length
                            RETURN length)
                  return {personal : x, count : c}`    
    console.log("0:  ",boardId, uid, aql)                   
    if (boardId && uid) {
      const {personal, count} = db._query(aql).toArray()[0];
      console.log("Count:  ",count, personal)    
      if(count[0] < 5 ) {
        const gob = db._collection('inboard').save(
        {
          _from : personal._to,
          _to : boardId
        })
       console.log("2222:   ",gob) 
      }else {
        res.throw(400, "there are allready 5 public boards for this user");
      }  
    }else{
      res.throw(400, "Error in NewBoard");
    }
  })
  .summary("Get On Board")
  .body(
    joi.object().required(),
    'This implies JSON.'
  );  


  router.post('/removeb', function (req, res) {
    const board =  req.body     
    const { uid, board_id } = board   
    if (uid && board_id) {
      const aql1 = `FOR x in pboard filter x._key == '${uid}' 
                      FOR u IN inboard                    
                       filter u._from == x._id and u._to == '${board_id}'
                       remove u in inboard return OLD`
      const aql2 =`for c in inboard filter c._to == '${board_id}'
                     COLLECT WITH COUNT INTO cnt
                     return cnt`                       
      const aql3 = `FOR u IN gboard
                        filter u._id == '${board_id}' and u.noDelete != true
                        remove u in gboard return OLD
                        return OLD.name`
      const old =   db._query(aql1).toArray()[0]                 
      const count = db._query(aql2).toArray()[0]
      console.log("pop::",old,count)
      if(count < 1 ) db._query(aql3)

      res.json({ massage : `unBoarding board` })
    }else{
      res.throw(400, "Error in REMOVE Board");
    }
  })
  .summary("Remove Board")
  .body(
    joi.object().required(),
    'This implies JSON.'
  );

  router.post('/support', function (req, res) { 
    const { _id, uid } = req.body   
    const userId = `pboard/${uid}`
    let sign = 1
    if (_id) {
      const query = `FOR u in support filter u._from == '${userId}' and u._to == '${_id}' return u._id `
      const supported = db._query(query).toArray()[0]
      console.log("nooosh:  ",supported, sign, query)
      if (supported){
        db._query(`FOR u in support filter u._from == @_from and u._to==@_to REMOVE u IN support `,{_from: userId , _to: _id})
        sign = -1
      }else{
        const I = db._collection('support').save({_from: userId, _to: _id})
      }
      const updated = db._query(`FOR u IN commandment filter u._id == @_id update u WITH {support : u.support + @sign} in commandment return NEW`,{_id : _id, sign : sign})
      res.json({ updated : updated })
    }else{
      res.throw(400, "Error in support commandment");
    }
  })
  .summary("support Commandment")
  .body(
    joi.object().required(),
    'This implies JSON.'
  );

  router.post('/unsupport', function (req, res) { 
    const { _id, uid } = req.body   
    const userId = `pboard/${uid}`    
    let sign = 1
    if (_id) {
      const unsupported = db._query(`FOR u in unsupport filter u._from == @_from  and u._to == @_to return u._id `,{_from: userId , _to: _id}).toArray()[0] 
      if (unsupported){
        db._query(`FOR u in unsupport filter u._from == @_from and u._to==@_to REMOVE u IN unsupport `,{_from: userId , _to: _id})
        sign = -1
      }else{
        const I = db._collection('unsupport').save({_from: userId, _to: _id})
      }
      const updated = db._query(`FOR u IN commandment filter u._id == @_id update u WITH {unsupport : u.unsupport + @sign} in commandment return NEW`,{_id : _id, sign : sign})
      res.json({ updated : updated })
    }else{
      res.throw(400, "Error in unSupport commandment");
    }
  })
  .summary("unSupport Commandment")
  .body(
    joi.object().required(),
    'This implies JSON.'
  );  

  router.post('/signup', function (req, res) {
     const newUser =  req.body
     const {UserUID,Identifier} = newUser

     if (Identifier && UserUID) {
       const exists = db._query(`FOR u IN pboard FILTER u._key=='${UserUID}' AND u.Identifier=='${Identifier}' return u`).toArray()    
       if (!exists[0]) {
         //const user = db._collection('users').save(newUser)
         const user = db._collection('pboard').save({_key :UserUID, name: Identifier, of: Identifier ,tour : {personal: false, com: false, geo: false}})

         res.json(201,{user : user})
       }else{
        res.throw(400, "A user with the same Email allready exists");
       }
    }else{
      res.throw(400, "SignIn with faulty data");
    }
  })
  .summary("SignUp - opens new user and the user's personal board")
  .body(
    joi.object().required(),
    'This implies JSON.'
  ); 

  router.post('/tour', function (req, res) {
    const { tour,uid } = req.body
    const aql1 = `FOR u IN pboard
                    filter u._key == '${uid}' 
                      update u with {tour : tour} in pboard `      
    
    const xx2 = db._query(aql1).toArray()      
    xx2 ? res.json(201,{message : 'tour data excepted'}) : res.throw(400, "tour faulty data")
  })
  .summary("SignUp - opens new user and the user's personal board")
  .body(
    joi.object().required(),
    'This implies JSON.'
  ); 
  
  router.get('/com', function (req, res) {
  const obj = req.queryParams 
  //obj.text = obj.text == '' ?  '$' : obj.text
  const { orderby, offset, count, uid }  = obj
  const orderBy = !!orderby ? `SORT u.${orderby} DESC ` : ''
  console.log("oc:",offset,count)
  const limit =  !!count && !!offset ? `LIMIT ${offset},${count} ` : ' limit 30 '
  const search2 = obj.text > '' ? ` SEARCH PHRASE(u.text, '${obj.text}', 'text_en') ` : ''
  const search = obj.text > '' ? ` SEARCH ANALYZER(u.text IN TOKENS('${obj.text}', 'text_en'), 'text_en') SORT BM25(u) DESC ` : ''  
  const query =  `FOR u IN com_v
                  ${search} ${obj.text === '' ? orderBy : ''} ${limit} 
                  LET supported = (
                    FOR s IN support 
                      FILTER s._from == 'pboard/${uid}' and s._to == u._id
                      RETURN s
                    )
                  LET unsupported = (
                    FOR un IN unsupport 
                      FILTER un._from == 'pboard/${uid}' and un._to == u._id
                      RETURN un
                    )                    
                  return { _id: u._id, text: u.text, author: u.author, support: u.support, unsupport: u.unsupport, supported: LENGTH(supported), unsupported: LENGTH(unsupported)  } ` 
  console.log("QUERY: ",query)
  const coms = db._query(query).toArray();    
    res.json({ commandments: coms });
  })
  .summary("returns Commandment List");

  router.get('/com2', function (req, res) {
  const obj = req.queryParams  
  const { orderby, offset, count, uid }  = obj
  delete  obj.uid
  delete obj.orderby
  delete obj.count
  delete obj.offset
  const orderBy = !!orderby ? `SORT u.${orderby} DESC ` : ''
  const limit = !!count && !!offset ? `LIMIT ${offset},${count} ` : ''

  const query =  `FOR u IN commandment ${filter(obj)} ${orderBy} ${limit}
                  LET supported = (
                    FOR s IN support 
                      FILTER s._from == 'pboard/${uid}' and s._to == u._id
                      RETURN s
                    )
                  LET unsupported = (
                    FOR un IN unsupport 
                      FILTER un._from == 'pboard/${uid}' and un._to == u._id
                      RETURN un
                    )                    
                  return { _id: u._id, text: u.text, author: u.author, support: u.support, unsupport: u.unsupport, supported: LENGTH(supported), unsupported: LENGTH(unsupported)  } ` 
  console.log("QUERY: ",query)
  const coms = db._query(query).toArray();    
    res.json({ commandments: coms });
  })
  .summary("returns Commandment List");


  router.get('/geoBoards', function (req, res) {
  const obj = req.queryParams  
  const { bid, latitude, longitude, radius , uid }  = obj
  delete obj.uid
  
  if( !(latitude && longitude) ) res.throw(400, "Error in geoBoards parameters");
  
  const query = `LET point = GEO_POINT(${latitude},${longitude})
                 FOR b IN gboard
                   filter has(b,"location") 
                   FILTER GEO_DISTANCE(point, b.location) <= ${radius || 2000}

                   let pboard = (for x in pboard filter x._key == '${uid}'
                                return x._id)[0]

                   let p = (for y in inboard
                                filter y._from == pboard && y._to == b._id 
                                return true)

                   let score = (for ub in 1..1 inbound b._id inboard
                                    for corr in board_corr
                                      filter corr._from == pboard && corr._to == ub._id
                                      COLLECT AGGREGATE sc = avg(corr.corr)
                                      return sc )

                   let c = (FOR y IN 2..2 INBOUND b._id inboard  
                          collect com = y with count into cnt
                          sort cnt desc
                          return {_id :com._id,text : com.text, cnt :cnt})

                  let commandments = (for x in c limit 5 return x )   

                  RETURN {board :b ,commandments : commandments, onboard : p, score:score[0]}`

  console.log("QUERY: ",query)
  /*COLLECT AGGREGATE sc = SUM(corr.corr) */
  const boards = db._query(query).toArray();    
  const ubAQL = `for x in pboard filter x._key == '${uid}'
                  FOR b IN 1..1 OUTBOUND x._id inboard 
                  let c = (FOR y IN 2..2 INBOUND b._id inboard  
                          collect com = y with count into cnt
                          sort cnt desc
                          return {_id :com._id,text : com.text, cnt :cnt}
                          )
                  let commandments = (for q in c limit 5 return q )                          
                  RETURN {board :b ,commandments : commandments}` 
  const userBoards = db._query(ubAQL).toArray();   
    res.json({ geoBoards: boards, userBoards : userBoards });
  })
  .summary("returns Geo Boards List");


  router.get('/getBoards', function (req, res) {
  const obj = req.queryParams  
  const { uid }  = obj
  const ubAQL = `for x in pboard filter x._key == '${uid}'
                  FOR y IN 1..1 OUTBOUND x._id inboard 
                  return y ` 
  const boards = db._query(ubAQL).toArray();    
    res.json({ boards: boards });
  })
  .summary("returns users Boards List");


  router.get('/personal', function (req, res) {
    var data = db._query(AQLPersOnalboard(req.queryParams.uid)).toArray();
    console.log("pppp:",data)
    if (!data[0]) {
      data = db._query(AQLPersOnalonlyBoard(req.queryParams.uid)).toArray();
    }
    res.status(200).json({data: data});
  })
  .summary("returns user's personal board")
    .queryParam("uid", 
    joi.string().required()
  );  




/* CALCULATE COMMENDMENTS CORRELATION    :
for com in commandment
    for p in inboard 
        filter p._from == com._id
        for g in inboard
            filter g._to == p._to && g._from != com._id 
            
            UPSERT { _from: com._id , _to: g._from}
                INSERT { _from: com._id , _to: g._from, corr: 990}
                UPDATE {corr : OLD.corr + 990 }
            IN commandment_corr  
            RETURN g

   CALCULATE USERS BOARDS CORRELATION    :
for personal in board
    filter has(personal,"of") //personal._from == "users/uxfdn43EfTg8AqkPbaGRr5RnXOk1"
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
        INSERT { _from : personal._id , _to: b._id, corr: score} INTO board_corr  OPTIONS { overwrite: true }
        return ({_from : personal._id , _to: b._id, pcom : pcom , bcom : bcom, score: score})
        
        */

