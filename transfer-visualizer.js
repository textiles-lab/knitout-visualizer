"use strict";

//  .    }- TIP_HEIGHT
// (=)   }- LOOP_HEIGHT
//  v    }- HOOK_HEIGHT
// (=)   }- LOOP_HEIGHT
// -|-   }- PINCH_HEIGHT
//  |

const BED_GAP_HEIGHT = 20;
const NEEDLE_HEIGHT = 20; //includes hook, slider

const HOOK_HEIGHT = 2;
const TIP_HEIGHT = 1;

const LOOP_HEIGHT = 2;
const PINCH_HEIGHT = 1;
const GAP_HEIGHT = 1; //space between loop/loop, loop/pinch, etc...

const NEEDLE_SPACING = 18; //between centers
const NEEDLE_WIDTH = 4;
const LOOP_WIDTH = NEEDLE_WIDTH + 2 * LOOP_HEIGHT;
const PINCH_WIDTH = NEEDLE_WIDTH + 2 * PINCH_HEIGHT;

//types of things on needles:
const TYPE_BASE  = {name:'base',  height:0.0, width:NEEDLE_WIDTH};
const TYPE_HOOK  = {name:'hook',  height:HOOK_HEIGHT, width:NEEDLE_WIDTH};
const TYPE_TIP   = {name:'tip',   height:TIP_HEIGHT, width:NEEDLE_WIDTH};
const TYPE_LOOP  = {name:'loop',  height:LOOP_HEIGHT, width:LOOP_WIDTH};
const TYPE_PINCH = {name:'pinch', height:PINCH_HEIGHT, width:PINCH_WIDTH};

//StackItem is something held in a stack on a needle; handled as a doubly-linked list:

function TVStackItem(type) {
	this.type = type;
	this.stackNext = null;
	this.stackPrev = null;
	//StackItems connect to links via a left and right port:
	this.left = {item:this, side:-1, link:null};
	this.right = {item:this, side:1, link:null};
}
TVStackItem.prototype.remove = function() {
	if (this.stackNext !== null) this.stackNext.stackPrev = this.stackPrev;
	if (this.stackPrev !== null) this.stackPrev.stackNext = this.stackNext;
	this.stackPrev = null;
	this.stackNext = null;
};

TVStackItem.prototype.insertBetween = function(stackPrev, stackNext) {
	console.assert(this.stackNext === null && this.stackPrev === null, "should only insert if not already in stack");
	console.assert(stackPrev !== null || stackNext !== null, "need some items to insert between");
	console.assert(stackPrev === null || stackPrev.stackNext === stackNext, "must insert between adjacent items");
	console.assert(stackNext === null || stackNext.stackPrev === stackPrev, "must insert between adjacent items");

	this.stackPrev = stackPrev;
	if (stackPrev !== null) stackPrev.stackNext = this;
	this.stackNext = stackNext;
	if (stackNext !== null) stackNext.stackPrev = this;
};

TVStackItem.prototype.insertBefore = function(item) {
	this.insertBetween(item.stackPrev, item);
};
TVStackItem.prototype.insertAfter = function(item) {
	this.insertBetween(item, item.stackNext);
};

//TVLink connects two ports on TVStackItems:
function TVLink(a, b, slack) {
	console.assert(a && a.link === null, "Link must connect something that isn't linked.");
	console.assert(b && b.link === null, "Link must connect something that isn't linked.");
	this.a = a;
	this.b = b;
	this.slack = slack;
	this.a.link = this;
	this.b.link = this;
}

TVLink.prototype.remove = function() {
	this.a.link = null;
	this.b.link = null;
	this.a = null;
	this.b = null;
};

TVLink.prototype.addPath = function(ctx) {
	//TODO: deal with path routing? / layout?
	ctx.moveTo(this.a.item.centerX + this.a.side * this.a.item.type.width * 0.5, this.a.item.centerY);
	ctx.lineTo(this.b.item.centerX + this.b.side * this.b.item.type.width * 0.5, this.b.item.centerY);
};



//TVNeedle holds some stackitems:

function TVNeedle(number) {
	this.number = number;

	this.base = new TVStackItem(TYPE_BASE);
	this.hook = new TVStackItem(TYPE_HOOK);
	this.tip  = new TVStackItem(TYPE_TIP);

	this.hook.insertAfter(this.base);
	this.tip.insertAfter(this.hook);
}

//make loop or pinch on the hook or slider:
TVNeedle.prototype.makeItem = function(type, on) {
	let loop = new TVStackItem(type);
	if (on === 'slider') {
		loop.insertBefore(this.tip);
	} else {
		console.assert(typeof(on) === 'undefined' || on === 'hook', "makeItem expecting 'hook' or 'slider' for parameter");
		loop.insertBefore(this.hook);
	}
	return loop;
};

//make loop on the hook or slider:
TVNeedle.prototype.makeLoop = function(on) {
	return this.makeItem(TYPE_LOOP, on);
};

TVNeedle.prototype.makePinch = function(on) {
	return this.makeItem(TYPE_PINCH, on);
};

TVNeedle.prototype.layout = function(centerX, baseY, inY) {
	//set the x- and y-coordinates of all the objects in this needle's stack:
	this.centerX = centerX;
	this.baseY = baseY;
	this.inY = inY;

	let hookLoops = 0;
	let hookPinches = 0;
	for (let obj = this.base.stackNext; obj !== this.hook; obj = obj.stackNext) {
		if (obj.type === TYPE_LOOP) ++hookLoops;
		else if (obj.type == TYPE_PINCH) ++hookPinches;
		else console.warn("unexpected object in hook");
	}

	let sliderLoops = 0;
	let sliderPinches = 0;
	for (let obj = this.hook.stackNext; obj !== this.tip; obj = obj.stackNext) {
		if (obj.type === TYPE_LOOP) ++sliderLoops;
		else if (obj.type == TYPE_PINCH) ++sliderPinches;
		else console.warn("unexpected object in slider");
	}

	//Figure out how much space there is between loops/pinches on the needle:

	let height = (hookLoops + sliderLoops) * LOOP_HEIGHT + (hookPinches + sliderPinches) * PINCH_HEIGHT + HOOK_HEIGHT + TIP_HEIGHT;
	let flexGaps = 0;
	if (sliderLoops + sliderPinches > 0) {
		height += 2 * GAP_HEIGHT; //hook [gap] .... [gap] slider
		flexGaps += (sliderLoops + sliderPinches - 1);
	}
	if (hookLoops + hookPinches > 0) {
		height += 2 * GAP_HEIGHT; //base [gap] .... [gap] hook
		flexGaps += (hookLoops + hookPinches - 1);
	}

	let flexGap = GAP_HEIGHT;
	if (flexGaps > 0) {
		let maxFlexGap = (NEEDLE_HEIGHT - height) / flexGaps;
		flexGap = Math.min(flexGap, maxFlexGap);
	}

	let y = baseY + inY * NEEDLE_HEIGHT;

	//tip:
	this.tip.centerX = this.centerX;
	this.tip.centerY = y - 0.5 * inY * TIP_HEIGHT;
	y += -inY * TIP_HEIGHT;

	//tip ... hook:
	for (let obj = this.tip.stackPrev; obj !== this.hook; obj = obj.stackPrev) {
		//gap from previous thing:
		if (obj.stackNext === this.tip) y += -inY * GAP_HEIGHT;
		else y += -inY * flexGap;

		//height of thing:
		let h = obj.type.height;

		obj.centerX = this.centerX;
		obj.centerY = y - 0.5 * inY * h;
		y += -inY * h;
	}

	if (this.tip.stackPrev !== this.hook) {
		y += -inY * GAP_HEIGHT;
	}

	//hook:
	this.hook.centerX = this.centerX;
	this.hook.centerY = y - 0.5 * inY * HOOK_HEIGHT;
	y += -inY * HOOK_HEIGHT;

	//hook ... base:
	for (let obj = this.hook.stackPrev; obj !== this.base; obj = obj.stackPrev) {
		//gap from previous thing:
		if (obj.stackNext === this.hook) y += -inY * GAP_HEIGHT;
		else y += -inY * flexGap;

		//height of thing:
		let h = obj.type.height;

		obj.centerX = this.centerX;
		obj.centerY = y - 0.5 * inY * h;
		y += -inY * h;
	}

};

TVNeedle.prototype.draw = function(ctx) {

	function rangeRect(aX, aY, bX, bY) {
		ctx.fillRect(Math.min(aX,bX), Math.min(aY, bY), Math.abs(bX-aX), Math.abs(bY-aY));
	}

	//pinches go under needle:
	for (var obj = this.base.stackNext; obj !== this.tip; obj = obj.stackNext) {
		if (obj.type === TYPE_PINCH) {
			ctx.fillStyle = (obj.mark ? '#ed0' : '#e11');
			ctx.fillRect(obj.centerX - 0.5 * PINCH_WIDTH, obj.centerY - 0.5 * PINCH_HEIGHT, PINCH_WIDTH, PINCH_HEIGHT);
		}
	}

	//sides:
	ctx.fillStyle = '#888';
	rangeRect(this.centerX - 0.5*NEEDLE_WIDTH, this.baseY, this.centerX - 0.5 * NEEDLE_WIDTH + 1, this.baseY + this.inY * NEEDLE_HEIGHT);
	rangeRect(this.centerX + 0.5*NEEDLE_WIDTH, this.baseY, this.centerX + 0.5 * NEEDLE_WIDTH - 1, this.baseY + this.inY * NEEDLE_HEIGHT);

	//core (up to hook):
	ctx.fillStyle = '#aaa';
	rangeRect(this.centerX - 0.5*NEEDLE_WIDTH + 1, this.baseY, this.centerX + 0.5 * NEEDLE_WIDTH - 1, this.hook.centerY + this.inY * 0.5 * HOOK_HEIGHT);

	//non-pinches go over needle:
	for (var obj = this.base.stackNext; obj !== this.tip; obj = obj.stackNext) {
		if (obj.type === TYPE_TIP) {
			//nothing to draw
		} else if (obj.type === TYPE_HOOK) {
			//TODO: draw... something?
		} else if (obj.type === TYPE_LOOP) {
			ctx.fillStyle = (obj.mark ? '#fe0' : '#f22');
			ctx.fillRect(obj.centerX - 0.5 * LOOP_WIDTH, obj.centerY - 0.5 * LOOP_HEIGHT, LOOP_WIDTH, LOOP_HEIGHT);
		} else if (obj.type === TYPE_PINCH) {
			//drawn earlier
		}
	}

	
};

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

function TransferVisualizer(div) {
	window.XV = this; //DEBUG

	this.div = div;

	var minNeedle = div.getAttribute("data-minNeedle");
	if (minNeedle === null) {
		minNeedle = 0;
	} else {
		minNeedle = parseInt(minNeedle);
	}

	var maxNeedle = div.getAttribute("data-maxNeedle");
	if (maxNeedle === null) {
		maxNeedle = 5;
	} else {
		maxNeedle = parseInt(maxNeedle);
	}

	var maxRacking = div.getAttribute("data-maxRacking");
	if (maxRacking === null) {
		maxRacking = 2;
	} else {
		maxRacking = parseInt(maxRacking);
	}
	console.log(maxRacking);

	//remove div contents (store for later use as moves):
	var moves = div.innerHTML;
	div.innerHTML = "";

	var canvas = document.createElement("canvas");

	let minWidth = (maxNeedle - minNeedle + 1 + maxRacking) * NEEDLE_SPACING;
	let minHeight = (NEEDLE_HEIGHT + BED_GAP_HEIGHT + NEEDLE_HEIGHT);

	this.baseWidth = minWidth;
	this.baseHeight = minHeight;
	this.scale = 1.0;

	canvas.style.position = "absolute";
	//these will be adjusted by "resizeCanvas" later:
	canvas.style.left = "0";
	canvas.style.top = "0";
	canvas.style.width = "100%";
	canvas.style.height = "100%";

	//create an aspect-ratio container for the canvas:
	let container = document.createElement("div");
	container.style.minWidth = minWidth + "px";
	container.style.width = "100%";
	container.style.height = "0";
	container.style.paddingTop = ((minHeight / minWidth) * 100.0) + "%";
	//container.style.background = "brown";
	container.style.position = "relative";
	container.style.overflow = "visible";

	container.appendChild(canvas);
	div.appendChild(container);

	this.canvas = canvas;
	this.ctx = canvas.getContext('2d');

	//'requestDraw' will trigger 'resizeCanvas':
	window.addEventListener('resize', function(){ me.requestDraw(); });

	this.minNeedle = minNeedle;
	this.maxNeedle = maxNeedle;
	this.racking = 1;

	this.frontNeedles = [];
	this.backNeedles = [];
	this.slacks = [];
	this.links = [];

	for (var n = minNeedle; n <= maxNeedle; ++n) {
		this.frontNeedles.push(new TVNeedle(n));
		this.backNeedles.push(new TVNeedle(n));
	}

	//------------- build initial stitches + links --------------
	var start = div.getAttribute("data-start");

	//parse start as list of needles + slacks:
	let startTokens = start.split(/\s+/);
	let prevLoop = null;
	for (let i = 0; i < startTokens.length; i += 2) {
		let bn = parseBedNeedle(startTokens[i]);
		if (bn === null) {
			this.error("Failed to parse start needle '" + startTokens[i] + "'");
			continue;
		}
		let loop;
		if (bn.bed[0] === "f") {
			loop = this.frontNeedles[bn.needle - this.minNeedle].makeLoop(bn.bed === 'fs' ? 'slider' : 'hook');
		} else { console.assert(bn.bed[0] === "b", "must be front or back bed");
			loop = this.backNeedles[bn.needle - this.minNeedle].makeLoop(bn.bed === 'bs' ? 'slider' : 'hook');
		}
		if (i > 0) {
			//create link:
			let slack = parseInt(startTokens[i+1]);
			if (slack === slack) {
				slack = {length:slack};
				this.slacks.push(slack);
			} else {
				slack = null;
			}

			this.links.push(new TVLink(prevLoop.right, loop.left, slack));
		}
		prevLoop = loop;
	}

	this.states = [this.saveState("init")];

	//parse moves:
	moves.split(/\n/).forEach(function(line){
		let m = line.match(/^(.*:)?\s*(.*)\s*$/);
		if (m === null) {
			console.warning("Ignoring line '" + line + "'");
			return;
		}
		let label = m[1];
		if (typeof(label) === 'undefined') label = "";
		else label = label.substr(0, label.length-1);
		let ops = m[2];
		//console.log("Label: '" + label + "'" + " ops: '" + ops + "'");
		if (ops === "") {
			if (label !== "") console.warn("Empty ops with non-empty label");
			return;
		}
		this.clearMarks();
		let toks = ops.split(/\s+/);
		while (toks.length > 0) {
			if (toks.length < 2) {
				console.warn("Ignoring trailing token in ops.");
				break;
			}
			let from = parseBedNeedle(toks[0]);
			let to = parseBedNeedle(toks[1]);
			toks.splice(0,2);
			if (from === null || to === null) {
				console.warn("Failed to parse needle description");
			} else {
				this.xfer(from, to); //execute transfer
			}
			if (toks.length > 0) {
				let comma = toks.splice(0,1)[0];
				if (comma !== ',') {
					console.warn("Expected comma between xfers in single group, got '" + comma + "'");
				}
			}
		}
		this.states.push(this.saveState(label));
	}, this);

	this.currentStep = this.states.length-1;
	//this.loadState(this.states[this.currentStep]);

	this.requestDraw();

	let me = this;
	canvas.addEventListener('mousedown', function(evt){
		evt.preventDefault();

		if (me.currentStep + 1 < me.states.length) {
			me.currentStep += 1;
		} else {
			me.currentStep = 0;
		}
		me.loadState(me.states[me.currentStep]);

		return false;
	});
}

TransferVisualizer.prototype.resizeCanvas = function() {
	let par = this.canvas.parentElement;
	let maxWidth = par.clientWidth;
	let maxHeight = par.clientHeight;
	let scale = Math.max(1.0, Math.min(maxWidth / this.baseWidth, maxHeight / this.baseHeight));
	this.scale = scale;
	this.canvas.width = Math.round(this.baseWidth * scale);
	this.canvas.height = Math.round(this.baseHeight * scale);
	this.canvas.style.width = this.canvas.width + "px";
	this.canvas.style.height = this.canvas.height + "px";
};

TransferVisualizer.prototype.error = function(message) {
	if (this.hasError) return;
	this.hasError = true;

	console.error(message);
	//TODO: draw message somewhere on the device
};

TransferVisualizer.prototype.saveState = function(label) {
	let state = {
		label:label,
		front:[],
		back:[],
		links:[],
		slacks:[],
		racking:this.racking
	};

	this.slacks.forEach(function(s, si){
		state.slacks.push(s.length.toString());
		s.ref = si.toString();
	});

	//each needle is recorded as '|o|oo<o|'
	function recordNeedle(bed, target, n, ni){
		let desc = '';
		let idx = 0;
		for (let item = n.base.stackNext; item !== n.tip; item = item.stackNext) {
			if (item.type === TYPE_LOOP || item.type === TYPE_PINCH) {
				if (item.mark) {
					desc += (item.type === TYPE_LOOP ? 'O' : 'I') ;
				} else {
					desc += (item.type === TYPE_LOOP ? 'o' : 'i') ;
				}
				item.ref = bed + (ni + this.minNeedle) + '.' + (idx++);
			} else if (item.type === TYPE_HOOK) {
				desc += '<';
			}
		}
		target.push(desc);
	}
	this.frontNeedles.forEach(function(n, ni){ recordNeedle.call(this, 'f', state.front, n, ni); }, this);
	this.backNeedles.forEach(function(n, ni){ recordNeedle.call(this, 'b', state.back, n, ni); }, this);

	//each link is recorded as 'ref.[lr] slack ref.[lr]'
	this.links.forEach(function(l){
		let desc = '';
		desc += l.a.item.ref + '.' + (l.a.item.left === l.a ? 'l' : 'r');
		desc += ' ' + (l.slack === null ? '*' : l.slack.ref) + ' ';
		desc += l.b.item.ref + '.' + (l.b.item.left === l.b ? 'l' : 'r');
		state.links.push(desc);
	});

	return state;
};

TransferVisualizer.prototype.loadState = function(state) {
	//clear all slacks:
	this.slacks.splice(0);

	//clear all links:
	this.links.forEach(function(link) { link.remove(); });
	this.links.splice(0); //remove all elements

	//clear all needles:
	this.frontNeedles.forEach(function(n){
		while (n.base.stackNext !== n.hook) {
			n.base.stackNext.remove();
		}
		while (n.hook.stackNext !== n.tip) {
			n.hook.stackNext.remove();
		}
	});
	this.backNeedles.forEach(function(n){
		while (n.base.stackNext !== n.hook) {
			n.base.stackNext.remove();
		}
		while (n.hook.stackNext !== n.tip) {
			n.hook.stackNext.remove();
		}
	});

	//make new slacks:
	state.slacks.forEach(function(s) {
		this.slacks.push({length:parseInt(s)});
	}, this);

	let refToItem = {};

	//make new loops/pinches:
	function makeStuff(bed, needles, desc, ni){
		let n = needles[ni];
		let idx = 0;
		let on = 'hook';
		for (let i = 0; i < desc.length; ++i) {
			if (desc[i] === 'o' || desc[i] === 'O') {
				let item = refToItem[bed + (ni + this.minNeedle) + '.' + (idx++)] = n.makeLoop(on);
				if (desc[i] === 'O') item.mark = true;
			} else if (desc[i] === 'i' || desc[i] === 'I') {
				let item = refToItem[bed + (ni + this.minNeedle) + '.' + (idx++)] = n.makePinch(on);
				if (desc[i] === 'I') item.mark = true;
			} else if (desc[i] === '<') {
				on = 'slider';
			} else {
				console.error("Unrecognized needle character '" + desc[i] + "'.");
			}
		}
	}

	state.front.forEach(function(desc, ni){ makeStuff.call(this, 'f', this.frontNeedles, desc, ni); }, this);
	state.back.forEach(function(desc, ni){ makeStuff.call(this, 'b', this.backNeedles, desc, ni); }, this);

	//make new links:
	state.links.forEach(function(desc){
		let m = desc.match(/^([^\s]+)\.([lr]) (\*|\d+) ([^\s]+)\.([lr])$/);
		console.assert(m !== null, "link desc should always unpack");
		let refA = m[1];
		let sideA = m[2];
		let slack = parseInt(m[3]);
		if (slack === slack) slack = this.slacks[slack];
		else slack = null;

		let refB = m[4];
		let sideB = m[5];
		console.assert(refA in refToItem, "ref should exist");
		console.assert(refB in refToItem, "ref should exist");
		let itemA = refToItem[refA];
		let itemB = refToItem[refB];

		this.links.push(new TVLink(itemA[sideA === 'l' ? "left" : "right"], itemB[sideB === 'l' ? "left" : "right"], slack));
	}, this);

	//read out racking:
	this.racking = state.racking;

	this.requestDraw();
};

TransferVisualizer.prototype.requestDraw = function() {
	if (this.hasError) return; //don't trigger draws if there is an error
	if (this.drawRequested) return;
	this.drawRequested = true;
	var me = this;
	window.requestAnimationFrame(function(ts){ delete me.drawRequested; me.draw(); });
};

TransferVisualizer.prototype.draw = function() {
	if (this.hasError) return; //don't draw over error condition

	this.resizeCanvas();

	const ctx = this.ctx;
	const canvas = this.canvas;


	ctx.resetTransform();
	ctx.fillStyle = '#eee';
	ctx.fillRect(0,0,canvas.width,canvas.height);

	ctx.width = canvas.width / this.scale;
	ctx.height = canvas.height / this.scale;

	ctx.setTransform(this.scale,0, 0,this.scale, 0,0);

	const backLeft = 0.5 * ctx.width
		- 0.5 * NEEDLE_SPACING * (this.maxNeedle + this.minNeedle)
		+ this.racking * 0.5 * NEEDLE_SPACING;
	const frontLeft = 0.5 * ctx.width
		- 0.5 * NEEDLE_SPACING * (this.maxNeedle + this.minNeedle)
		- this.racking * 0.5 * NEEDLE_SPACING;

	//layout all needles:
	for (var n = this.minNeedle; n <= this.maxNeedle; ++n) {
		this.frontNeedles[n-this.minNeedle].layout(frontLeft + n * NEEDLE_SPACING - 0.5*NEEDLE_WIDTH, ctx.height, -1);
		this.backNeedles[n-this.minNeedle].layout(backLeft + n * NEEDLE_SPACING - 0.5*NEEDLE_WIDTH, 0, 1);
	}

	//compute slack lengths:
	this.slacks.forEach(function(s){ s.current = 0; });
	this.links.forEach(function(l){
		if (l.slack) {
			l.slack.current += Math.abs(l.a.item.centerX - l.b.item.centerX);
		}
	});
	this.slacks.forEach(function(s){ s.current /= NEEDLE_SPACING; });

	//draw links:
	ctx.beginPath();
	this.links.forEach(function(link){ link.addPath(ctx); });
	ctx.lineCap = 'round';
	ctx.lineWidth = 1.0;
	ctx.strokeStyle = '#e11';
	ctx.stroke();
	ctx.lineCap = 'butt';

	//draw all pinches/loops:
	for (var n = this.minNeedle; n <= this.maxNeedle; ++n) {
		this.frontNeedles[n-this.minNeedle].draw(ctx);
		this.backNeedles[n-this.minNeedle].draw(ctx);
	}

};

TransferVisualizer.prototype.setRacking = function(racking) {
	this.racking = racking;
	this.requestDraw();
};

TransferVisualizer.prototype.clearMarks = function() {
	function clearMarks(n) {
		for (let item = n.base; item !== n.tip; item = item.stackNext) {
			delete item.mark;
		}
	};
	this.frontNeedles.forEach(clearMarks);
	this.backNeedles.forEach(clearMarks);
};

//NOTE: 'from' and 'to' should have .bed and .needle members
TransferVisualizer.prototype.xfer = function(from, to) {
	let fromNeedle = (from.bed[0] === 'f' ? this.frontNeedles : this.backNeedles)[from.needle - this.minNeedle];
	let toNeedle = (to.bed[0] === 'f' ? this.frontNeedles : this.backNeedles)[to.needle - this.minNeedle];

	let fromBase, fromTip;
	if (from.bed[1] === 's') {
		fromBase = fromNeedle.hook;
		fromTip = fromNeedle.tip;
	} else {
		fromBase = fromNeedle.base;
		fromTip = fromNeedle.hook;
		console.assert(fromNeedle.hook.stackNext === fromNeedle.tip, "can't xfer *over* from slider");
	}

	let toTip;
	if (to.bed[1] === 's') {
		toTip = toNeedle.tip;
	} else {
		toTip = toNeedle.hook;
		console.assert(toNeedle.hook.stackNext === toNeedle.tip, "can't xfer *over* to slider");
	}

	if (fromBase.stackNext === fromTip) return; //nothing to actually move

	//set racking for xfer:
	if (from.bed[0] === 'b') {
		this.setRacking(to.needle - from.needle);
	} else { //xfering *to* back bed
		this.setRacking(from.needle - to.needle);
	}

	//capture pinches:

	//walk around ccw the tip of the 'from' needle to the tip of the 'to' needle, accumulating links:
	let iter = {
		needles:(from.bed[0] === 'f' ? this.frontNeedles : this.backNeedles),
		index:from.needle - this.minNeedle,
		side:(from.bed[0] === 'f' ? 'right' : 'left')
	};
	iter.item = iter.needles[iter.index].tip;

	let end = {
		needles:(to.bed[0] === 'f' ? this.frontNeedles : this.backNeedles),
		index:to.needle - this.minNeedle,
		side:(to.bed[0] === 'f' ? 'left' : 'right')
	};
	end.item = end.needles[end.index].tip;

	let tv = this;
	iter.advance = function() {
		//return 'false' if reached end:
		if (this.item === end.item && this.side === end.side) return false;

		//otherwise advance:
		if ((this.side === 'left') === (this.needles === tv.frontNeedles)) {
			//on the front left and back right, move toward tip
			if (this.item.stackNext !== null) {
				this.item = this.item.stackNext;
			} else {
				//if at tip, flip to other side:
				this.side = (this.side === 'left' ? 'right' : 'left'); //flip around the tip
			}
		} else {
			//on the front right and back left, move away from tip
			if (this.item.stackPrev !== null) {
				this.item = this.item.stackPrev;
			} else {
				//if base reached, move to next needle:
				if (this.needles === tv.frontNeedles) {
					console.assert(this.side === 'right', "must be on right");
					this.index += 1;
					if (this.index >= tv.frontNeedles.length) {
						this.needles = tv.backNeedles;
						this.index = tv.backNeedles.length - 1;
						//stay on same (right) side.
					} else {
						this.side = 'left';
					}
				} else {
					console.assert(this.side === 'left', "must be on left");
					this.index -= 1;
					if (this.index < 0) {
						this.needles = tv.frontNeedles;
						this.index = 0;
						//stay on same (left) side.
					} else {
						this.side = 'right'; //flip to other side.
					}
				}
				this.item = this.needles[this.index].base;
			}
		}
		return true;
	};

	let sideStack = [];
	do {
		let side = iter.item[iter.side];
		if (side.link) {
			if (sideStack.length && sideStack[sideStack.length-1].link === side.link) {
				sideStack.pop();
			} else {
				sideStack.push(side);
			}
		}
	} while (iter.advance());

	sideStack.forEach(function(side){
		let other = (side === side.link.a ? side.link.b : side.link.a);
		let slack = side.link.slack;

		//NOTE: linked list of links would make this less expensive:
		this.links.splice(this.links.indexOf(side.link), 1); //remove link from list
		side.link.remove();

		//DEBUG:
		this.links.forEach(function(link){
			console.assert(link.a !== null, "links shouldn't be removed (post-splice)");
		});

		//add pinch at tip of 'from':
		let pinch = fromNeedle.makePinch(from.bed[1] === 's' ? 'slider' : 'hook');
		console.log(side, other, slack, pinch);
		if (from.bed[0] === 'f') {
			//from is on front bed, so 'side' is on right
			this.links.push(new TVLink(pinch.right, side, slack));
			this.links.push(new TVLink(pinch.left, other, slack));
		} else {
			//from is on back bed, so 'side' is on left
			this.links.push(new TVLink(pinch.right, other, slack));
			this.links.push(new TVLink(pinch.left, side, slack));
		}
	}, this);

	//DEBUG:
	this.links.forEach(function(link){
		console.assert(link.a !== null, "links shouldn't be removed");
	});


	//move loops:
	while (fromTip.stackPrev !== fromBase) {
		let obj = fromTip.stackPrev;
		obj.remove();
		obj.insertBefore(toTip);
		obj.mark = true;
	}

	//release pinches
	while (toTip.stackPrev.type === TYPE_PINCH) {
		let pinch = toTip.stackPrev;
		pinch.remove();
		let a = (pinch.left.link.a === pinch.left ? pinch.left.link.b : pinch.left.link.a);
		let b = (pinch.right.link.a === pinch.right ? pinch.right.link.b : pinch.right.link.a);
		let slack = pinch.left.link.slack;

		this.links.splice(this.links.indexOf(pinch.left.link), 1); //remove link from list
		this.links.splice(this.links.indexOf(pinch.right.link), 1); //remove link from list
		pinch.left.link.remove();
		pinch.right.link.remove();

		this.links.push(new TVLink(a, b, slack));
	}

	this.requestDraw();
};


function init() {
	var elts = document.getElementsByClassName("xferVis");
	for (var i = 0; i < elts.length; ++i) {
		var elt = elts[i];
		if (elt.tagName !== 'DIV') continue;
		new TransferVisualizer(elt);
	}

}

init();
