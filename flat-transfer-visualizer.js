"use strict";

const NEEDLE_SPACING = 15;

const NEEDLE_WIDTH = 2;
const SLIDER_WIDTH = 1;

const LOOP_GAP = 1;
const YARN_RADIUS = 1.5;
const LOOP_WIDTH = NEEDLE_WIDTH + 2.0 * SLIDER_WIDTH + 2.0 * YARN_RADIUS;

const INDICATOR_OFFSET = 1;
const INDICATOR_GAP = -0.5;
const INDICATOR_WIDTH = 2;

const LOOP_COLORS = [
	['#e11', '#a11', '#911'],
	['#e11', '#b11', '#911'],
	['#e11', '#c11', '#911'],
];

const FIRST_COLORS = [
	['#e81', '#a51'],
	['#e81', '#b61'],
	['#e81', '#c71'],
];

//
//  | |  \_ ?? SLIDER_SOMETHING ?? (or just part of BED_GAP_HEIGHT, I guess)
//  | |  /
//  |^|  \
//  |#|  |- NEEDLE_HEIGHT
//  |#|  /
//       \_ UNDER_HEIGHT
// ----  /

const BED_GAP_HEIGHT = 9;
const NEEDLE_HEIGHT = 12;
const UNDER_HEIGHT = 5;

const EXTEND_HEIGHT = 8; //how far into the bed gap to extend

const EXTEND_SPEED = EXTEND_HEIGHT / 0.25;

function parseBedNeedle(str) {
	let m = str.match(/^([fb]s?)(-?\d+)$/);
	if (m === null) {
		return null;
	} else {
		return {
			bed:m[1],
			needle:parseInt(m[2])
		};
	}
};

function FlatTransferVisualizer(div) {
	window.FXV = this; //DEBUG

	this.animations = [];

	//remove div contents (store for later use as moves):
	var moves = div.innerHTML;
	div.innerHTML = "";

	//create hierarchy of div > container > canvas:
	this.div = div;
	this.container = document.createElement("div");
	this.div.appendChild(this.container);
	this.canvas = document.createElement("canvas");
	this.container.appendChild(this.canvas);

	this.ctx = this.canvas.getContext('2d');
	
	//parseMoves should set minNeedle, maxNeedle, maxRacking; also sets up canvas size / container aspect.
	this.parseMoves(moves);

	//advance xfers if mouse clicked:
	let me = this;
	this.canvas.addEventListener('mousedown', function(evt){
		evt.preventDefault();
		me.nextPass();
		return false;
	});
}

FlatTransferVisualizer.prototype.nextPass = function nextPass() {
	if (this.nextMove >= this.moves.length) {
		if (this.racking !== 0) {
			this.setRacking(0);
			return true;
		} else {
			//restore first state
			this.needles = { };
			this.loops.forEach(function(l){
				this.getNeedle('f' + l.start).loops.push(l);
			}, this);
			this.nextMove = 0;
			this.requestDraw();
			return false;
		}
	}

	//aggregate a pass's worth of moves:
	let move = this.moves[this.nextMove];
	this.nextMove += 1;
	let from = this.getNeedle(move.from.bed + move.from.needle);
	let to = this.getNeedle(move.to.bed + move.to.needle);
	let racking;
	if (from.bed[0] === 'f') {
		racking = from.needle - to.needle;
	} else {
		racking = to.needle - from.needle;
	}

	let fromBed = from.bed;
	let toBed = to.bed;
	let fromTo = to.needle - from.needle;

	let froms = [from];
	let tos = [to];

	while (this.nextMove < this.moves.length) {
		let next = this.moves[this.nextMove];
		if (next.from.bed === fromBed && next.to.bed === toBed && next.to.needle - next.from.needle == fromTo) {
			this.nextMove += 1;
			move = next;
			froms.push(this.getNeedle(move.from.bed + move.from.needle));
			tos.push(this.getNeedle(move.to.bed + move.to.needle));
		} else {
			break;
		}
	}

	//animate those moves:
	this.setRacking(racking);
	//idea:
	// extend 'from' loops and slider
	// extend 'to' hook/slider
	// retract 'from' slider
	// (loops get re-assigned?)
	// retract 'to' hook/slider, compacting loops
	this.queueAnimation({
		phase:0,
		update:function(elapsed) {
			var moving = false;
			function extend(n){
				if (n.extend < EXTEND_HEIGHT) {
					n.extend = Math.min(EXTEND_HEIGHT, n.extend + elapsed * EXTEND_SPEED);
					moving = true;
				}
			}
			function retract(n){
				//hook
				if (n.extend > 0.0) {
					n.extend = Math.max(0.0, n.extend - elapsed * EXTEND_SPEED);
					moving = true;
				}
			}
			if (this.phase === 0) {
				//extend 'from':
				froms.forEach(extend);
				if (moving) return 0.0;
				this.phase = 1;
				//console.log("Moving to phase " + this.phase);
				for (let i = 0; i < froms.length; ++i) {
					let from = froms[i];
					let to = tos[i];
					to[(to.bed[0] === 'f') ? "max" : "min"] = true;
				}
			}
			if (this.phase === 1) {
				//extend 'to':
				tos.forEach(extend);
				if (moving) return 0.0;
				this.phase = 2;
				//console.log("Moving to phase " + this.phase);
				for (let i = 0; i < froms.length; ++i) {
					let from = froms[i];
					let to = tos[i];
					to.loops.push(...from.loops.reverse());
					from.loops = [];
				}
			}
			if (this.phase === 2) {
				//retract 'from':
				froms.forEach(retract);
				if (moving) return 0.0;
				this.phase = 3;
				//console.log("Moving to phase " + this.phase);
			}
			if (this.phase === 3) {
				//retract 'to':
				tos.forEach(retract);
				if (moving) return 0.0;
				this.phase = 4;
				//console.log("Moving to phase " + this.phase);
			}
			return elapsed;
		},
		finish:function() {
			//console.log("Finishing from/to"); //DEBUG
			for (let i = 0; i < froms.length; ++i) {
				let from = froms[i];
				let to = tos[i];
				to.loops.push(...from.loops.reverse());
				from.loops = [];
				delete to.min;
				delete to.max;
			}
		}
	});
	return true;
};

FlatTransferVisualizer.prototype.getNeedle = function getNeedle(name) {
	if (!(name in this.needles)) {
		var bn = parseBedNeedle(name);
		this.needles[name] = {bed:bn.bed, needle:bn.needle, loops:[], extend:0.0};
	}
	return this.needles[name];
};

FlatTransferVisualizer.prototype.parseMoves = function parseMoves(moves) {
	this.minNeedle = 1;
	this.maxNeedle = 1;
	this.racking = 0;
	this.maxRacking = 8;

	this.loops = []; // {start:i, offset:o, first:true/false}
	this.moves = []; // {from:, to:}
	this.nextMove = 0;

	let setupJSON = "";
	let inSetup = false;

	let ops = [];
	moves.split(/\n/).forEach(function(line){
		let comment = "";

		let commentStart = line.indexOf(';');
		if (commentStart != -1) {
			comment = line.substr(commentStart+1);
			line = line.substr(0, commentStart);
		}

		let op = [];
		line.split(/\s+/).forEach(function(tok){
			if (tok !== "") op.push(tok);
		});

		if (op.length > 0) {
			ops.push(op);
		}
		if (comment !== "") {
			if (!inSetup && setupJSON === "" && comment.indexOf('{') !== -1) inSetup = true;
			if (inSetup) {
				setupJSON += comment;
				if (comment.indexOf('}') !== -1) inSetup = false;
			}
		}
	});

	try {
		let setup = JSON.parse(setupJSON);
		if (!(Array.isArray(setup.offsets))) throw "setup JSON should have array of offsets";
		if (!(Array.isArray(setup.firsts))) throw "setup JSON should have array of firsts";
		if (setup.offsets.length !== setup.firsts.length) throw "setup JSON firsts and offsets should be the same length";
		if (Number.isInteger(setup.maxRacking) && setup.maxRacking > 0) {
		} else if (Number.isInteger(setup.transferMax) && setup.transferMax > 0) {
		} else {
			throw "setup JSON should have positive integer maxRacking / transferMax";
		}

		setup.offsets.forEach(function(o,i){
			if (!Number.isInteger(o)) throw "setup JSON offsets should be integers";
			var first = Boolean(setup.firsts[i]);
			this.loops.push({start:i, offset:o, first:first});
		}, this);

		this.minNeedle = 0;
		this.maxNeedle = this.loops.length-1;
		this.maxRacking = setup.maxRacking || setup.transferMax;

		ops.forEach(function(op){
			if (op[0] === "xfer") {
				if (op.length !== 3) throw "xfer without three arguments: '" + (op.join(" ")) + "'";
				let from = parseBedNeedle(op[1]);
				if (from === null) throw "invalid needle '" + op[1] + "' parsing op";
				let to = parseBedNeedle(op[2]);
				if (to === null) throw "invalid needle '" + op[1] + "' parsing op";

				if (["fb","fsb","fbs", "bf", "bsf", "bfs"].indexOf(from.bed + to.bed) === -1) {
					throw "cannot transfer from " + from.bed + " to " + to.bed;
				}
				this.minNeedle = Math.min(this.minNeedle, from.needle, to.needle);
				this.maxNeedle = Math.max(this.maxNeedle, from.needle, to.needle);

				this.moves.push({from:from, to:to});
			} else {
				throw "Unknown op '" + op[0] + "'";
			}
		}, this);

	} catch (e) {
		console.error(e);
	}

	//stack loops on their starting needles:
	this.needles = { };
	this.loops.forEach(function(l){
		this.getNeedle('f' + l.start).loops.push(l);
	}, this);

	//handle various width/height tomfoolery:

	let minWidth = (this.maxNeedle - this.minNeedle + 1 + this.maxRacking) * NEEDLE_SPACING;
	let minHeight = (NEEDLE_HEIGHT + BED_GAP_HEIGHT + NEEDLE_HEIGHT + UNDER_HEIGHT);

	this.baseWidth = minWidth;
	this.baseHeight = minHeight;
	this.scale = 1.0;

	this.canvas.style.position = "absolute";
	//these will be adjusted by "resizeCanvas" later:
	this.canvas.style.left = "0";
	this.canvas.style.top = "0";
	this.canvas.style.width = "100%";
	this.canvas.style.height = "100%";

	//create an aspect-ratio container for the canvas:
	this.container.style.minWidth = minWidth + "px";
	this.container.style.width = "100%";
	this.container.style.height = "0";
	this.container.style.paddingTop = ((minHeight / minWidth) * 100.0) + "%";
	//container.style.background = "brown";
	this.container.style.position = "relative";
	this.container.style.overflow = "visible";

	this.requestDraw();
};


FlatTransferVisualizer.prototype.resizeCanvas = function() {
	let par = this.container;
	let maxWidth = par.clientWidth;
	let maxHeight = par.clientHeight;
	let scale = Math.max(2.0, Math.min(maxWidth / this.baseWidth, maxHeight / this.baseHeight));
	let ratio = window.devicePixelRatio || 1.0;
	scale *= ratio;
	this.scale = scale;
	this.canvas.width = Math.round(this.baseWidth * scale);
	this.canvas.height = Math.round(this.baseHeight * scale);
	this.canvas.style.width = (this.canvas.width / ratio) + "px";
	this.canvas.style.height = (this.canvas.height / ratio) + "px";
};

FlatTransferVisualizer.prototype.error = function(message) {
	if (this.hasError) return;
	this.hasError = true;

	console.error(message);
	//TODO: draw message somewhere on the device
};

FlatTransferVisualizer.prototype.queueAnimation = function(anim) {
	console.assert('update' in anim, "Animations should have 'update' function");
	console.assert('finish' in anim, "Animations should have 'finish' function");
	if (this.animations.length == 0) {
		delete this.lastTimestamp;
	}
	this.animations.push(anim);
	this.requestDraw();
};

FlatTransferVisualizer.prototype.requestDraw = function() {
	if (this.hasError) return; //don't trigger draws if there is an error
	if (this.drawRequested) return;
	this.drawRequested = true;
	var me = this;
	window.requestAnimationFrame(function(ts){
		delete me.drawRequested;
		var elapsed = 0.0;
		if ('lastTimestamp' in me) {
			elapsed = (ts - me.lastTimestamp) / 1000.0;
		}
		me.lastTimestamp = ts;
		me.update(elapsed);
		me.draw();
	});
};

FlatTransferVisualizer.prototype.update = function(elapsed) {
	while (this.animations.length) {
		let remain = this.animations[0].update(elapsed);
		if (remain === 0.0) break;
		this.animations[0].finish();
		this.animations.shift();
		elapsed = remain;
	}
	if (this.animations.length) {
		this.requestDraw();
	}
};

FlatTransferVisualizer.prototype.getSVG = function() {
	this.scale = 1.0;
	let canvas = { width:this.baseWidth, height:this.baseHeight };

	let xf = [1,0, 0,1, 0,0];
	let pathData = '';
	let commands = [];

	let svg = {
		resetTransform : function() { xf = [1,0, 0,1, 0,0]; },
		setTransform : function(...args) {
			console.assert(args.length === 6, "setTransform takes exactly six arguments");
			xf = args.slice();
		},

		createLinearGradient : function(x0, y0, x1, y1) {
			return {
				addColorStop: function() {
					//TODO
				}
			};
		},

		fillStyle:'#f0f',
		strokeStyle:'#f0f',
		lineWidth:1.0,
		lineCap:'butt',
		lineJoin:'miter',

		fillRect : function(x,y,w,h) {
			commands.push('<rect style="fill:' + this.fillStyle + ';stroke:none;" x="' + x + '" y="' + y + '" width="' + w + '"  height="' + h + '" />');
		},
		beginPath : function() {
			pathData = '';
		},
		moveTo : function(x,y) {
			pathData += 'M' + x + ' ' + y;
		},
		lineTo : function(x,y) {
			pathData += 'L' + x + ' ' + y;
		},
		bezierCurveTo : function(x1,y1,x2,y2,x,y) {
			pathData += 'C' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y2 + ' ' + x + ' ' + y;
		},
		closePath : function(x1,y1,x2,y2,x,y) {
			pathData += 'Z';
		},
		stroke : function() {
			commands.push('<path fill="none" stroke="' + this.strokeStyle + '" stroke-width="' + this.lineWidth + '" stroke-linecap="' + this.lineCap + '" stroke-linejoin="' + this.lineJoin + '" d="'+pathData+'" />');
		},
		fill : function() {
			commands.push('<path style="fill:' + this.fillStyle + ';stroke:none;" d="'+pathData+'" />');
		},
	};

	this.drawHelper(canvas, svg);

	commands.unshift('<svg width="' + 4 * this.baseWidth + 'px" height="' + 4 * this.baseHeight + 'px" viewBox="0 0 '+ this.baseWidth+' '+this.baseHeight+'">');
	commands.push('</svg>');

/*
	let elt = document.createElement('div');
	elt.innerHTML = commands.join("\n");
	document.body.appendChild(elt);
*/

	return commands.join("\n");

};

FlatTransferVisualizer.prototype.draw = function() {
	if (this.hasError) return; //don't draw over error condition

	this.resizeCanvas();

	this.drawHelper(this.canvas, this.ctx);
};


FlatTransferVisualizer.prototype.drawHelper = function(canvas, ctx) {

	ctx.resetTransform();
	ctx.fillStyle = '#eee';
	ctx.fillRect(0,0,canvas.width,canvas.height);

	ctx.width = canvas.width / this.scale;
	ctx.height = canvas.height / this.scale;

	let px = 1.0 / this.scale;

	ctx.setTransform(this.scale,0, 0,this.scale, 0,0);

	const backLeft = 0.5 * ctx.width
		- 0.5 * NEEDLE_SPACING * (this.maxNeedle + this.minNeedle)
		+ this.racking * 0.5 * NEEDLE_SPACING;
	const frontLeft = 0.5 * ctx.width
		- 0.5 * NEEDLE_SPACING * (this.maxNeedle + this.minNeedle)
		- this.racking * 0.5 * NEEDLE_SPACING;
	
	let onBackSlider = [];
	let onFrontSlider = [];
	for (let i = this.minNeedle; i <= this.maxNeedle; ++i) {
		onBackSlider.push(0);
		onFrontSlider.push(0);
	}

	//layout loops on needles:
	for (let name in this.needles) {
		const n = this.needles[name];
		let x,y,prevX,yStep;
		if (n.bed === 'b' || n.bed === 'bs') {
			x = n.needle * NEEDLE_SPACING + backLeft;
			prevX = x;
			y = NEEDLE_HEIGHT + n.extend;
			if (n.bed === 'b') {
				y -= n.loops.length * (2.0 * YARN_RADIUS + LOOP_GAP);
			}
			yStep = 1.0;
		} else if (n.bed === 'f' || n.bed === 'fs') {
			x = n.needle * NEEDLE_SPACING + frontLeft;
			prevX = x;
			y = NEEDLE_HEIGHT + BED_GAP_HEIGHT - n.extend;
			if (n.bed === 'f') {
				y += n.loops.length * (2.0 * YARN_RADIUS + LOOP_GAP);
			}
			yStep = -1.0;
		} else {
			console.log(n);
			console.assert(false, "needle without a bed?");
		}
		if (n.bed === 'bs') {
			onBackSlider[n.needle - this.minNeedle] += n.loops.length;
		} else if (n.bed === 'fs') {
			onFrontSlider[n.needle - this.minNeedle] += n.loops.length;
		}
		n.loops.forEach(function(l, i){
			l.wantedOffset = l.start + l.offset - n.needle;
			if (n.bed[0] === 'b') l.wantedOffset = Math.round(l.wantedOffset - this.racking);
			let newY = y + (LOOP_GAP + YARN_RADIUS + i * (2.0 * YARN_RADIUS + LOOP_GAP)) * yStep;
			if ('at' in l) {
				if (n.min) {
					newY = Math.min(newY, l.at.y);
				} else if (n.max) {
					newY = Math.max(newY, l.at.y);
				}
			}
			
			l.at = {
				x:x,
				y:newY
			};
			l.prevX = prevX;
		}, this);
	}

	//update previous loop positions:
	let r = LOOP_WIDTH + 2.0 * YARN_RADIUS + LOOP_GAP;
	for (let iter = 0; iter < 10; ++iter) {
		for (let i = 0; i < this.loops.length; ++i) {
			this.loops[i].delta = 0.0;
		}
		for (let i = 1; i < this.loops.length; ++i) {
			let d = (this.loops[i].prevX - this.loops[i-1].prevX) - r;
			if (d < 0) {
				this.loops[i-1].delta += 0.5 * d;
				this.loops[i].delta -= 0.5 * d;
			}
		}
		for (let i = 0; i < this.loops.length; ++i) {
			this.loops[i].prevX += this.loops[i].delta;
			delete this.loops[i].delta;
		}
	}

	//draw links to previous loops:
	let sorted = this.loops.slice();
	sorted.sort(function (a,b) {
		return Math.sign(a.at.y - b.at.y);
	});
	sorted.forEach(function(l){
		ctx.beginPath();
		ctx.moveTo(l.at.x + 0.5 * LOOP_WIDTH, l.at.y);
		ctx.lineTo(l.prevX + 0.3 * LOOP_WIDTH, NEEDLE_HEIGHT + BED_GAP_HEIGHT + NEEDLE_HEIGHT + UNDER_HEIGHT);
		ctx.moveTo(l.at.x - 0.5 * LOOP_WIDTH, l.at.y);
		ctx.lineTo(l.prevX - 0.3 * LOOP_WIDTH, NEEDLE_HEIGHT + BED_GAP_HEIGHT + NEEDLE_HEIGHT + UNDER_HEIGHT);

		ctx.lineCap = 'round';
		ctx.lineWidth = 2.0 * YARN_RADIUS;
		ctx.strokeStyle = (l.first ? FIRST_COLORS : LOOP_COLORS)[(l.start - this.minNeedle) % LOOP_COLORS.length][1];
		ctx.stroke();
	}, this);
	ctx.lineCap = 'butt';

	//draw loop cover bits:
	this.loops.forEach(function(l){
		ctx.beginPath();
		ctx.moveTo(l.prevX - 0.5 * LOOP_WIDTH, NEEDLE_HEIGHT + BED_GAP_HEIGHT + NEEDLE_HEIGHT + UNDER_HEIGHT);
		ctx.lineTo(l.prevX + 0.5 * LOOP_WIDTH, NEEDLE_HEIGHT + BED_GAP_HEIGHT + NEEDLE_HEIGHT + UNDER_HEIGHT);

		ctx.lineCap = 'round';
		ctx.lineWidth = 2.0 * YARN_RADIUS;
		ctx.strokeStyle = LOOP_COLORS[(l.start - this.minNeedle) % LOOP_COLORS.length][2];
		ctx.stroke();
	}, this);

	//fade everything a bit:
	let t = NEEDLE_HEIGHT + BED_GAP_HEIGHT + 0.5 * NEEDLE_HEIGHT;
	let grad = ctx.createLinearGradient(0, t, 0, ctx.height);
	grad.addColorStop(0, 'rgba(238,238,238,0.0)');
	grad.addColorStop(1, 'rgba(238,238,238,0.8)');
	ctx.fillStyle = grad;
	console
	ctx.fillRect(0, t, ctx.width, ctx.height - t);


	//draw needles:
	//front:
	for (let i = this.minNeedle; i <= this.maxNeedle; ++i) {
		let extendHook = (('f' + i) in this.needles) ? this.needles['f' + i].extend : 0.0;
		let extendSlider = (('fs' + i) in this.needles) ? this.needles['fs' + i].extend : 0.0;

		let x = i * NEEDLE_SPACING + frontLeft;
		let y = NEEDLE_HEIGHT + BED_GAP_HEIGHT;
		ctx.fillStyle = '#888';
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH, y - extendHook, NEEDLE_WIDTH, NEEDLE_HEIGHT);
		ctx.fillStyle = '#aaa';
		let h = LOOP_GAP + (LOOP_GAP + 2.0 * YARN_RADIUS) * onFrontSlider[i - this.minNeedle];
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH - SLIDER_WIDTH, y - extendSlider - h, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
		ctx.fillRect(x + 0.5 * NEEDLE_WIDTH, y - extendSlider - h, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
	}
	//back:
	for (let i = this.minNeedle; i <= this.maxNeedle; ++i) {
		let extendHook = (('b' + i) in this.needles) ? this.needles['b' + i].extend : 0.0;
		let extendSlider = (('bs' + i) in this.needles) ? this.needles['bs' + i].extend : 0.0;

		let x = i * NEEDLE_SPACING + backLeft;
		let y = NEEDLE_HEIGHT;
		ctx.fillStyle = '#888';
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH, y + extendHook - NEEDLE_HEIGHT, NEEDLE_WIDTH, NEEDLE_HEIGHT);
		ctx.fillStyle = '#aaa';
		let h = LOOP_GAP + (LOOP_GAP + 2.0 * YARN_RADIUS) * onBackSlider[i - this.minNeedle];
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH - SLIDER_WIDTH, y + extendSlider - NEEDLE_HEIGHT, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
		ctx.fillRect(x + 0.5 * NEEDLE_WIDTH, y + extendSlider - NEEDLE_HEIGHT, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
	}

	//draw loops on needles:
	ctx.lineCap = 'round';
	ctx.lineWidth = 2.0 * YARN_RADIUS;
	this.loops.forEach(function(l){
		ctx.beginPath();
		ctx.moveTo(l.at.x - 0.5 * LOOP_WIDTH, l.at.y);
		ctx.lineTo(l.at.x + 0.5 * LOOP_WIDTH, l.at.y);
		ctx.strokeStyle = (l.first ? FIRST_COLORS : LOOP_COLORS)[(l.start - this.minNeedle) % LOOP_COLORS.length][0];
		ctx.stroke();
	},this);
	ctx.lineCap = 'butt';

	//draw loop offset indicators:
	this.loops.forEach(function(l){
		if (l.wantedOffset === 0) return;
		ctx.beginPath();
		for (let o = 1; o <= l.wantedOffset; ++o) {
			let x = l.at.x + 0.5 * LOOP_WIDTH + YARN_RADIUS + INDICATOR_OFFSET + (INDICATOR_GAP + INDICATOR_WIDTH) * o;
			let y = l.at.y;
			ctx.moveTo(x, y);
			ctx.lineTo(x - INDICATOR_WIDTH, y + 0.75 * INDICATOR_WIDTH);
			ctx.lineTo(x - INDICATOR_WIDTH, y - 0.75 * INDICATOR_WIDTH);
			ctx.closePath();
		}
		for (let o = -1; o >= l.wantedOffset; --o) {
			let x = l.at.x - 0.5 * LOOP_WIDTH - YARN_RADIUS - INDICATOR_OFFSET + (INDICATOR_GAP + INDICATOR_WIDTH) * o;
			let y = l.at.y;
			ctx.moveTo(x, y);
			ctx.lineTo(x + INDICATOR_WIDTH, y + 0.75 * INDICATOR_WIDTH);
			ctx.lineTo(x + INDICATOR_WIDTH, y - 0.75 * INDICATOR_WIDTH);
			ctx.closePath();
		}
		ctx.fillStyle = '#000';
		ctx.fill();
	},this);

};

FlatTransferVisualizer.prototype.setRacking = function(racking) {
	let fxv = this;
	this.queueAnimation({
		update:function(elapsed){
			if (fxv.racking === racking) {
				return elapsed;
			} else if (fxv.racking < racking) {
				fxv.racking = Math.min(fxv.racking + 2.5 * elapsed, racking);
			} else { //(fxv.racking > racking)
				fxv.racking = Math.max(fxv.racking - 2.5 * elapsed, racking);
			}
			return 0.0;
		},
		finish:function(elapsed){
			fxv.racking = racking;
		}
	});
};

if (typeof(require) !== 'undefined' && 'main' in require && require.main === module) {
	//running from command line:
	if (process.argv.length !== 4) {
		console.error("Usage:\n ./flat-transfer-visualizer.js <xfers.xout> <out.svg>\n Writes each pass to outNN.svg");
		process.exit(1);
	}
	const inFile = process.argv[2];
	const outFile = process.argv[3];

	if (!outFile.endsWith(".svg")) {
		console.error("Expecting output file to end with \".svg\"");
		process.exit(1);
	}

	const fs = require('fs');
	var document = {
		createElement:function(){ return document; },
		appendChild:function(){ },
		getContext:function() { return {}; },
		style:{},
		innerHTML:';{ "offsets":[0], "firsts":[0], "transferMax":3 }',
		addEventListener:function() { },
	};
	var window = {
		requestAnimationFrame:function(){ },
	};
	let fxv = new FlatTransferVisualizer(document);
	fxv.parseMoves(fs.readFileSync(inFile, 'utf8'));

	let index = 0;
	do {
		while (fxv.animations.length) {
			fxv.animations.shift().finish();
		}
		let fn = index.toString();
		while (fn.length < 2) fn = "0" + fn;
		fs.writeFileSync(outFile.substr(0,outFile.length-4) + fn + ".svg", fxv.getSVG(), 'utf8');
		++index;
	} while (fxv.nextPass());


} else {
	//running in browser:
	function init() {
		var elts = document.getElementsByClassName("flatXferVis");
		for (var i = 0; i < elts.length; ++i) {
			var elt = elts[i];
			if (elt.tagName !== 'DIV') continue;
			new FlatTransferVisualizer(elt);
		}

	}
	init();
}

