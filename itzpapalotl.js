  "use strict";

  const createRouter = require('@arangodb/foxx/router');
  const router = createRouter();

  module.context.use(router);

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
  const AQLUserBoards = (id) => `FOR v IN 1..1 OUTBOUND ${id} onboard RETURN v`;

  const AQLUserPersonalBoard = (id) => `FOR v,e,p IN 1..1 OUTBOUND "users/${id}" onboard 
  FILTER p.edges[*].personal ALL == true
  for x in inbound v._id inboard
  RETURN {board : {id: v._id, name : v.name}, commandment : {id: x._id, text: x.text, author: x.author}}`;

  const AQLUserPersonalOnlyBoard = (id) => `FOR v,e,p IN 1..1 OUTBOUND "users/${id}" onboard 
  FILTER p.edges[*].personal ALL == true
  RETURN {board : {id: v._id, name : v.name}}`;

  const AQLBoardCommandments = (id) => `FOR v IN 1..1 INBOUND ${id} inboard RETURN v`;

 
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
    const user = db._query(`FOR u IN users FILTER u._key == @uid return u`,{uid : uid}).toArray()    
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
    if (commandment) {
      const user = `users/${uid}`
      const aql = `FOR v,e,p IN 1..1 OUTBOUND '${user}' onboard 
                FILTER p.edges[*].personal ALL == true
                for x in inbound v._id inboard
                    COLLECT WITH COUNT INTO length
                RETURN length`
      const count = db._query(aql).toArray();      
      if (count < 5) {
        const exists = db._query(`for c in commandment filter c.text == "${commandment}" return c`).toArray()
        const com = exists[0] ? exists[0]  : db._collection('commandment').save({text: commandment, active: false, support: 1, unsupport: 0, usedby : 1})
        const I = db._collection('inboard').save({_from: com._id, _to: boardid})
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

  router.post('/removec', function (req, res) {
    const newC =  req.body     
    const { _from, _to } = newC   
    if (_from && _to) {

      const xxx = db._query(`FOR u IN inboard filter u._from == @_from and u._to == @_to remove u in inboard return OLD`,{_from: _from ,_to : _to }).toArray()  
      const count = db._query(`for c in inboard filter c._from == @_from
                                COLLECT WITH COUNT INTO cnt
                                return cnt`,{_from: _from}).toArray()      
      if (count && (count[0] <= 0)) db._query(`FOR u IN commandment filter u._id == @_from and u.noDelete != true remove u in commandment return OLD`,{_from: _from })

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
    const user = `users/${uid}`
    console.log("0:  ",  req.body) 
    const aql = `for x in onboard
                  filter x._from == '${user}'
                  let c = (FOR y IN 1..1 OUTBOUND x._to inboard 
                            COLLECT WITH COUNT INTO length
                            RETURN length)
                  return {personal : x, count : c}`
     console.log("Count1:  ",aql)              
    if (name && latitude && longitude && radius && uid) {
      const {personal, count} = db._query(aql).toArray()[0];
      console.log("Count:  ",count[0], name, latitude, longitude, radius, uid)    
      if(count[0] < 5 ) {
        const newBoard = db._collection('board').save(
          
        {
          name,
          personal: false,
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
    const user = `users/${uid}`
    const aql = `for x in onboard
                  filter x._from == '${user}'
                  let c = (FOR y IN 1..1 OUTBOUND x._to inboard 
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
    const newB =  req.body     
    const { _from, _to } = newB   
    if (_from && _to) {

      const xxx = db._query(`FOR u IN onboard filter u._from == @_from and u._to == @_to remove u in onboard return OLD`,{_from: _from ,_to : _to }).toArray()  
      const count = db._query(`for c in onboard filter c._to == @_to
                                COLLECT WITH COUNT INTO cnt
                                return cnt`,{_to: _to}).toArray()      
      if (count && (count[0] <= 0)) db._query(`FOR u IN boards filter u._id == @_to and u.noDelete != true remove u in boards return OLD`,{_to: _to })

      res.json({ removed : xxx })
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
    const userId = `users/${uid}`
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
    const userId = `users/${uid}`    
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
     delete newUser.UserUID
     newUser._key = UserUID
     if (Identifier && UserUID) {
       const exists = db._query(`FOR u IN users FILTER u._key=='${UserUID}' AND u.Identifier=='${Identifier}' return u`).toArray()    
       if (!exists[0]) {
         const user = db._collection('users').save(newUser)
         const board = db._collection('board').save({name: 'Personal Board', of: Identifier})
         const connect = db._collection('onboard').save({_from: user._id , _to: board._id, personal : true})
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
  
  router.get('/com', function (req, res) {
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
                      FILTER s._from == 'users/${uid}' and s._to == u._id
                      RETURN s
                    )
                  LET unsupported = (
                    FOR un IN unsupport 
                      FILTER un._from == 'users/${uid}' and un._to == u._id
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
                 FOR b IN board
                   FILTER GEO_DISTANCE(point, b.location) <= ${radius || 2000}
                   let c = (FOR y IN 2..2 INBOUND b._id inboard  
                          collect com = y with count into cnt
                          sort cnt desc
                          return {_id :com._id,text : com.text, cnt :cnt}
                          )
                  let commandments = (for x in c limit 5 return x )                          
                  RETURN {board :b ,commandments : commandments}`

  console.log("QUERY: ",query)
  const boards = db._query(query).toArray();    
    res.json({ boards: boards });
  })
  .summary("returns Geo Boards List");


  router.get('/personal', function (req, res) {
    var data = db._query(AQLUserPersonalBoard(req.queryParams.uid)).toArray();
    if (!data[0]) {
      data = db._query(AQLUserPersonalOnlyBoard(req.queryParams.uid)).toArray();
    }
    res.status(200).json({data: data});
  })
  .summary("returns user's personal board")
    .queryParam("uid", 
    joi.string().required()
  );  



