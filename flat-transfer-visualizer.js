"use strict";

const NEEDLE_SPACING = 15;

const NEEDLE_WIDTH = 2;
const SLIDER_WIDTH = 0.5;

const LOOP_GAP = 0.5;
const LOOP_WIDTH = 4;
const YARN_RADIUS = 1;

const INDICATOR_GAP = 0.5;
const INDICATOR_WIDTH = 1.5;

const LOOP_COLORS = [
	'#b11',
	'#c11',
	'#a11'
];

//
//  | |  \_ ?? SLIDER_SOMETHING ?? (or just part of BED_GAP_HEIGHT, I guess)
//  | |  /
//  |^|  \
//  |#|  |- NEEDLE_HEIGHT
//  |#|  /
//       \_ UNDER_HEIGHT
// ----  /

const BED_GAP_HEIGHT = 6;
const NEEDLE_HEIGHT = 6;
const UNDER_HEIGHT = 5;

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

		if (me.moves.length) {
			let move = me.moves.shift();
			let from = me.getNeedle(move.from.bed + move.from.needle);
			let to = me.getNeedle(move.to.bed + move.to.needle);
			let racking;
			if (from.bed[0] === 'f') {
				racking = from.needle - to.needle;
			} else {
				racking = to.needle - from.needle;
			}
			me.setRacking(racking);
			to.loops.push(...from.loops.reverse());
			from.loops = [];
			me.requestDraw();
		}

		return false;
	});

}

FlatTransferVisualizer.prototype.getNeedle = function getNeedle(name) {
	if (!(name in this.needles)) {
		var bn = parseBedNeedle(name);
		this.needles[name] = {bed:bn.bed, needle:bn.needle, loops:[]};
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
		if (!Number.isInteger(setup.maxRacking) || setup.maxRacking <= 0) throw "setup JSON should have positive integer maxRacking";

		setup.offsets.forEach(function(o,i){
			if (!Number.isInteger(o)) throw "setup JSON offsets should be integers";
			var first = Boolean(setup.firsts[i]);
			this.loops.push({start:i+1, offset:o, first:first});
		}, this);

		this.minNeedle = 1;
		this.maxNeedle = this.loops.length;
		this.maxRacking = setup.maxRacking;

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
	let scale = Math.max(1.0, Math.min(maxWidth / this.baseWidth, maxHeight / this.baseHeight));
	this.scale = scale;
	this.canvas.width = Math.round(this.baseWidth * scale);
	this.canvas.height = Math.round(this.baseHeight * scale);
	this.canvas.style.width = this.canvas.width + "px";
	this.canvas.style.height = this.canvas.height + "px";
};

FlatTransferVisualizer.prototype.error = function(message) {
	if (this.hasError) return;
	this.hasError = true;

	console.error(message);
	//TODO: draw message somewhere on the device
};

FlatTransferVisualizer.prototype.requestDraw = function() {
	if (this.hasError) return; //don't trigger draws if there is an error
	if (this.drawRequested) return;
	this.drawRequested = true;
	var me = this;
	window.requestAnimationFrame(function(ts){ delete me.drawRequested; me.draw(); });
};

FlatTransferVisualizer.prototype.draw = function() {
	if (this.hasError) return; //don't draw over error condition

	this.resizeCanvas();

	const ctx = this.ctx;
	const canvas = this.canvas;

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
			prevX = x + this.racking;
			y = NEEDLE_HEIGHT;
			if (n.bed === 'b') {
				y -= n.loops.length * (2.0 * YARN_RADIUS + LOOP_GAP);
			}
			yStep = 1.0;
		} else if (n.bed === 'f' || n.bed === 'fs') {
			x = n.needle * NEEDLE_SPACING + frontLeft;
			prevX = x;
			y = NEEDLE_HEIGHT + BED_GAP_HEIGHT;
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
			l.at = {
				x:x,
				y:y + (LOOP_GAP + YARN_RADIUS + i * (2.0 * YARN_RADIUS + LOOP_GAP)) * yStep
			};
			l.prevX = prevX;
		});
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
		ctx.strokeStyle = LOOP_COLORS[(l.start - this.minNeedle) % LOOP_COLORS.length];
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
		ctx.strokeStyle = '#911';
		ctx.stroke();
	}, this);


	//draw needles:
	//front:
	for (let i = this.minNeedle; i <= this.maxNeedle; ++i) {
		let x = i * NEEDLE_SPACING + frontLeft;
		let y = NEEDLE_HEIGHT + BED_GAP_HEIGHT;
		ctx.fillStyle = '#888';
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH, y, NEEDLE_WIDTH, NEEDLE_HEIGHT);
		ctx.fillStyle = '#aaa';
		let h = LOOP_GAP + (LOOP_GAP + 2.0 * YARN_RADIUS) * onFrontSlider[i - this.minNeedle];
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH - SLIDER_WIDTH, y - h, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
		ctx.fillRect(x + 0.5 * NEEDLE_WIDTH, y - h, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
	}
	//back:
	for (let i = this.minNeedle; i <= this.maxNeedle; ++i) {
		let x = i * NEEDLE_SPACING + backLeft;
		let y = NEEDLE_HEIGHT;
		ctx.fillStyle = '#888';
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH, y - NEEDLE_HEIGHT, NEEDLE_WIDTH, NEEDLE_HEIGHT);
		ctx.fillStyle = '#aaa';
		let h = LOOP_GAP + (LOOP_GAP + 2.0 * YARN_RADIUS) * onBackSlider[i - this.minNeedle];
		ctx.fillRect(x - 0.5 * NEEDLE_WIDTH - SLIDER_WIDTH, y - NEEDLE_HEIGHT, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
		ctx.fillRect(x + 0.5 * NEEDLE_WIDTH, y - NEEDLE_HEIGHT, SLIDER_WIDTH, h + NEEDLE_HEIGHT);
	}

	//draw loops on needles:
	ctx.beginPath();
	this.loops.forEach(function(l){
		ctx.moveTo(l.at.x - 0.5 * LOOP_WIDTH, l.at.y);
		ctx.lineTo(l.at.x + 0.5 * LOOP_WIDTH, l.at.y);
	},this);

	ctx.lineCap = 'round';
	ctx.lineWidth = 2.0 * YARN_RADIUS;
	ctx.strokeStyle = '#e11';
	ctx.stroke();
	ctx.lineCap = 'butt';

	//draw loop offset indicators:
	this.loops.forEach(function(l){
		if (l.wantedOffset === 0) return;
		ctx.beginPath();
		for (let o = 1; o <= l.wantedOffset; ++o) {
			let x = l.at.x + 0.5 * LOOP_WIDTH + YARN_RADIUS + (INDICATOR_GAP + INDICATOR_WIDTH) * o;
			let y = l.at.y;
			ctx.moveTo(x, y);
			ctx.lineTo(x - INDICATOR_WIDTH, y + 0.75 * INDICATOR_WIDTH);
			ctx.lineTo(x - INDICATOR_WIDTH, y - 0.75 * INDICATOR_WIDTH);
			ctx.closePath();
		}
		for (let o = -1; o >= l.wantedOffset; --o) {
			let x = l.at.x - 0.5 * LOOP_WIDTH - YARN_RADIUS + (INDICATOR_GAP + INDICATOR_WIDTH) * o;
			let y = l.at.y;
			ctx.moveTo(x, y);
			ctx.lineTo(x + INDICATOR_WIDTH, y + 0.75 * INDICATOR_WIDTH);
			ctx.lineTo(x + INDICATOR_WIDTH, y - 0.75 * INDICATOR_WIDTH);
			ctx.closePath();
		}
		if (l.first) {
			ctx.lineWidth = 2.0 * px;
			ctx.strokeStyle = '#000';
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.stroke();
			ctx.fillStyle = '#ff0';
			ctx.fill();
		} else {
			ctx.fillStyle = '#000';
			ctx.fill();
		}
	},this);

};

FlatTransferVisualizer.prototype.setRacking = function(racking) {
	this.racking = racking;
	this.requestDraw();
};

//NOTE: 'from' and 'to' should have .bed and .needle members
FlatTransferVisualizer.prototype.xfer = function(from, to) {

	this.requestDraw();
};


function init() {
	var elts = document.getElementsByClassName("flatXferVis");
	for (var i = 0; i < elts.length; ++i) {
		var elt = elts[i];
		if (elt.tagName !== 'DIV') continue;
		new FlatTransferVisualizer(elt);
	}

}

init();
