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

//types of things on needles:
const TYPE_BASE  = {name:'base',  height:0.0};
const TYPE_HOOK  = {name:'hook',  height:HOOK_HEIGHT};
const TYPE_TIP   = {name:'tip',   height:TIP_HEIGHT};
const TYPE_LOOP  = {name:'loop',  height:LOOP_HEIGHT};
const TYPE_PINCH = {name:'pinch', height:PINCH_HEIGHT};

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
	ctx.moveTo(this.a.item.centerX + this.a.side * NEEDLE_WIDTH * 0.5, this.a.item.centerY);
	ctx.lineTo(this.b.item.centerX + this.b.side * NEEDLE_WIDTH * 0.5, this.b.item.centerY);
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
			//draw pinch!
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
			ctx.fillStyle = '#f22';
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
	this.div = div;

	var minNeedle = 0;
	var maxNeedle = 4;

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

	canvas.width = (maxNeedle - minNeedle + 1 + maxRacking) * NEEDLE_SPACING;
	canvas.height = NEEDLE_HEIGHT + BED_GAP_HEIGHT + NEEDLE_HEIGHT;
	div.appendChild(canvas);


	this.canvas = canvas;
	this.ctx = canvas.getContext('2d');

	this.minNeedle = minNeedle;
	this.maxNeedle = maxNeedle;
	this.racking = 1;

	this.frontNeedles = [];
	this.backNeedles = [];
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
			this.links.push(new TVLink(prevLoop.right, loop.left, parseInt(startTokens[i+1])));
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
		console.log("Label: '" + label + "'" + " ops: '" + ops + "'");
		if (ops === "") {
			if (label !== "") console.warn("Empty ops with non-empty label");
			return;
		}
		let toks = ops.split(/\s+/);
		while (toks.length > 0) {
			if (toks.length < 2) {
				console.warn("Ignoring trailing token in ops.");
				break;
			}
			console.log(toks[0], toks[1]);
			let from = parseBedNeedle(toks[0]);
			let to = parseBedNeedle(toks[1]);
			toks.splice(0,2);
			if (from === null || to === null) {
				console.warn("Failed to parse needle description");
			} else {
				this.xfer(from, to); //execute transfer
			}
			if (toks.length > 0) {
				console.log(toks);
				let comma = toks.splice(0,1)[0];
				if (comma !== ',') {
					console.warn("Expected comma between xfers in single group, got '" + comma + "'");
				}
			}
		}
		this.states.push(this.saveState(label));
	}, this);

	this.currentStep = 0;
	this.loadState(this.states[this.currentStep]);

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

	window.XV = this; //DEBUG
}

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
		racking:this.racking
	};

	//each needle is recorded as '|o|oo<o|'
	function recordNeedle(bed, target, n, ni){
		let desc = '';
		let idx = 0;
		for (let item = n.base.stackNext; item !== n.tip; item = item.stackNext) {
			if (item.type === TYPE_LOOP || item.type === TYPE_PINCH) {
				desc += (item.type === TYPE_LOOP ? 'o' : '|') ;
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
		desc += ' ' + (l.slack === l.slack ? l.slack : '*') + ' ';
		desc += l.b.item.ref + '.' + (l.b.item.left === l.b ? 'l' : 'r');
		state.links.push(desc);
	});

	return state;
};

TransferVisualizer.prototype.loadState = function(state) {
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

	let refToItem = {};

	//make new loops/pinches:
	function makeStuff(bed, needles, desc, ni){
		let n = needles[ni];
		let idx = 0;
		let on = 'hook';
		for (let i = 0; i < desc.length; ++i) {
			if (desc[i] === 'o') {
				refToItem[bed + (ni + this.minNeedle) + '.' + (idx++)] = n.makeLoop(on);
			} else if (desc[i] === '|') {
				refToItem[bed + (ni + this.minNeedle) + '.' + (idx++)] = n.makePinch(on);
			} else if (desc[i] === 'v') {
				on = 'slider';
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

	const ctx = this.ctx;
	const canvas = this.canvas;

	ctx.resetTransform();
	ctx.fillStyle = '#eee';
	ctx.fillRect(0,0,canvas.width,canvas.height);

	const backLeft = 0.5 * canvas.width
		- 0.5 * NEEDLE_SPACING * (this.maxNeedle + this.minNeedle)
		+ this.racking * 0.5 * NEEDLE_SPACING;
	const frontLeft = 0.5 * canvas.width
		- 0.5 * NEEDLE_SPACING * (this.maxNeedle + this.minNeedle)
		- this.racking * 0.5 * NEEDLE_SPACING;

	//layout all needles:
	for (var n = this.minNeedle; n <= this.maxNeedle; ++n) {
		this.frontNeedles[n-this.minNeedle].layout(frontLeft + n * NEEDLE_SPACING - 0.5*NEEDLE_WIDTH, canvas.height, -1);
		this.backNeedles[n-this.minNeedle].layout(backLeft + n * NEEDLE_SPACING - 0.5*NEEDLE_WIDTH, 0, 1);
	}

	//draw links:
	ctx.beginPath();
	this.links.forEach(function(link){ link.addPath(ctx); });
	ctx.lineWidth = 1.0;
	ctx.strokeStyle = '#e11';
	ctx.stroke();

	//draw all pinches/loops:
	for (var n = this.minNeedle; n <= this.maxNeedle; ++n) {
		this.frontNeedles[n-this.minNeedle].draw(ctx);
		this.backNeedles[n-this.minNeedle].draw(ctx);
	}

};

//NOTE: 'from' and 'to' should have .bed and .needle members
TransferVisualizer.prototype.xfer = function(from, to) {
	//set racking for xfer:
	if (from.bed[0] === 'b') {
		this.racking = to.needle - from.needle;
	} else { //xfering *to* back bed
		this.racking = from.needle - to.needle;
	}
	//TODO: capture pinches

	//move loops:
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

	while (fromTip.stackPrev !== fromBase) {
		let obj = fromTip.stackPrev;
		obj.remove();
		obj.insertBefore(toTip);
	}

	//TODO: release pinches

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
