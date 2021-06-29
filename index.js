function reduceKeyPaths(object){
  if(!object) return "";
  return Object.entries(object).reduce((accum, [key, val]) => {
    accum += key;
    if(Object.prototype.toString.call(val) === '[object Object]'){
      accum += (':' + reduceKeyPaths(val));
    }
    return accum;
  }, "")
}


module.exports = function () {
  var regl = null
  var queue = []
  var map = {};
  var def = dfn('()')
  unset()
  def.queue = queue
  def.map = map;
  def.setQueue = function(queueInput){
    queue = queueInput
  }

  // This replicate method is used so that
  // one deferred regl can point all its methods
  // to another deferred instance
  // This is used in react-regl so that the global instance
  // can be pointed to componets as they are rendering
  // this is super brittle and need a
  def.replicateTo = function(target){
    target.replicant = this;
    // copy the queue to the target
    this.queue.forEach((qi) => {
      if(!qi.is_draw_command){
        target.queue.push(qi);
      }
    })

    // change all the references to the target
    target.map = {...this.map};
    Object.entries(this.map).forEach(([mk,mv]) => {
      this[mk] = target[mk];
    });

    this.draw = target.draw
    this.poll = target.poll
    this.clear = target.clear;
  }


  def.setRegl = function (r) {
    regl = r
    if (!r) return unset()
    for (var i = 0; i < queue.length; i++) {
      try{
        queue[i](regl)
      }catch(ex){
        console.error("deferred-regl queue failure!, ", queue[i].key, ex);
      }
    }
    queue = []

    if(this.replicant){
      this.replicant.frame = r.frame
      this.replicant.draw = r.draw
      this.replicant.poll = r.poll
      this.replicant.clear = r.clear
      this.replicant.buffer = r.buffer
      // overriding the these causes some failures
      /* this.replicant.texture = r.texture
       * this.replicant.elements = r.elements
       * this.replicant.framebuffer = r.framebuffer
       * this.replicant.framebufferCube = r.framebufferCube
       * this.replicant.renderbuffer = r.renderbuffer
       * this.replicant.cube = r.cube
       * this.replicant.read = r.read */
      this.replicant.hasExtension = r.hasExtension
      this.replicant.limits = r.limits
      this.replicant.stats = r.limits
      this.replicant.now = r.now
      this.replicant.destroy = r.destroy
      this.replicant.on = r.on
    }

    def.frame = r.frame
    def.draw = r.draw
    def.poll = r.poll
    def.clear = r.clear
    def.buffer = r.buffer
    def.texture = r.texture
    def.elements = r.elements
    def.framebuffer = r.framebuffer
    def.framebufferCube = r.framebufferCube
    def.renderbuffer = r.renderbuffer
    def.cube = r.cube
    def.read = r.read
    def.hasExtension = r.hasExtension
    def.limits = r.limits
    def.stats = r.limits
    def.now = r.now
    def.destroy = r.destroy
    def.on = r.on
  }
  return def

  function unset () {
    if (!queue) queue = []
    def.frame = function (cb) { queue.push(function (r) { r.frame(cb) }) }
    def.draw = function (cb) { queue.push(function (r) { r.draw(cb) }) }
    def.poll = function () { queue.push(function (r) { r.poll() }) }
    def.clear = function (opts) { queue.push(function (r) { r.clear(opts) }) }
    def.prop = function (key) {
      return function (context, props) {
        if (!falsy(props[key])) {
          return props[key]
        } else {
          // missing key could be speical case unrolled uniform prop
          // https://github.com/regl-project/regl/issues/258
          // https://github.com/regl-project/regl/issues/373
          var matches = key.match(/(?<prop>.+)\[(?<index>.+)\]/i)
          if (matches) {
            return props[matches.groups.prop][matches.groups.index]
          }
        }
      }
    }
    def.props = def.prop
    def.context = function (key) {
      return function (context, props) { return context[key] }
    }
    def['this'] = function (key) {
      return function (context, props) { return this[key] }
    }
    def.buffer = dfnx('buffer', ['subdata'])
    def.texture = dfn('texture')
    def.elements = dfn('elements')
    def.framebuffer = dfnx('framebuffer',['resize','use'])
    def.framebufferCube = dfn('framebufferCube')
    def.renderbuffer = dfn('renderbuffer')
    def.cube = dfn('cube')
    def.read = function () {}
    def.hasExtension = function () {}
    def.limits = {lineWidthDims: [1,1]}
    def.stats = function () {}
    def.now = function () { return 0 }
    def.destroy = function () { queue.push(function (r) { r.destroy() }) }
    def.on = function (name, f) { queue.push(function (r) { r.on(name,f) }) }
  }
  function dfn (key) {
    return function (opts) {
      if (key === '()' && regl) return regl(opts)
      else if (regl) return regl[key](opts)

      var f = null;
      var wrap = function(r){
        if(key === '()') {
          f = r(opts)
        } else {
          f = r[key](opts)
        }
      };
      if(key === '()') wrap.is_draw_command = true;
      wrap.key = key;
      wrap.opts = opts;
      wrap.queueIndex = queue.length - 1;
      queue.push(wrap);

      var r = function () {
        var args = arguments
        if (!falsy(f)) {
          if (key === '()') f.apply(null,args)
          else return f
        } else {
          var applyer = function (r) { f.apply(null,args) };
          applyer.key = key;
          applyer.opts = opts;
          applyer.queueIndex = queue.length - 1;
          queue.push(applyer)
        }
      }
      var mapKey = key+"-"+(queue.length-1)+"-"+reduceKeyPaths(opts)
      map[mapKey] = r;
      r.key = key
      r.opts = opts
      r.queueIndex = queue.length - 1;
      r.deferred_regl_resource = true;

      return map[mapKey];
    }
  }
  function dfnx (key, methods) {
    return function (opts) {
      if (key === '()' && regl) return regl(opts)
      else if (regl) return regl[key](opts)

      var f = null;
      var wrap = function(r){
        if(key === '()') {
          f = r(opts)
        } else {
          f = r[key](opts)
        }
      };
      if(key === '()') wrap.is_draw_command = true;
      wrap.key = key;
      wrap.opts = opts;
      wrap.queueIndex = queue.length - 1;
      queue.push(wrap);

      var r = function () {
        var args = arguments
        if (!falsy(f)) {
          if (key === '()') f.apply(null,args)
          else return f
        } else {
          var applyer = function (r) { f.apply(null,args) };
          applyer.key = key;
          applyer.opts = opts;
          applyer.queueIndex = queue.length - 1;
          queue.push(applyer)
        }
      }
      var mapKey = key+"-"+(queue.length-1)+"-"+reduceKeyPaths(opts);
      map[mapKey] = r;
      r.key = key
      r.opts = opts
      r.queueIndex = queue.length - 1;
      r.deferred_regl_resource = true;


      for (var i = 0; i < methods.length; i++) {
        var m = methods[i]
        r[m] = function () {
          var args = arguments
          if (!falsy(f)) {
            return f[m].apply(f,args)
          } else {
            var applyer = function (r) { f.apply(null,args) };
            applyer.key = key;
            applyer.opts = opts;
            applyer.queueIndex = queue.length - 1;
            queue.push(applyer)
          }
        }
      }
      return map[mapKey];
    }
  }
}

function falsy (x) {
  return x === null || x === undefined
}
