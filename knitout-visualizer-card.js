//protect rest of document from spurious variables:
/*DEBUG, don't: (function(){ */

//parseKnitout will parse knitout, catch syntax errors, and dispatch to calls on 'machine', an abstract knitting machine:
function parseKnitout(codeText, machine) {
	var errors = [];
	var warnings = [];

	var carrierNames = [];

	var inCommentHeader = true;
	var end = false;
	
	codeText.split("\n").forEach(function(line, lineNumber) {
		if (end) return;
		function addError(info) {
			console.log("Parse Error on line " + lineNumber + ": " + info);
			errors.push({lineNumber:lineNumber, text:info});
		}
		function addWarning(info) {
			console.log("Parse Warning on line " + lineNumber + ": " + info);
			warnings.push({lineNumber:lineNumber, text:info});
		}

		//magic first line:
		if (lineNumber == 0) {
			//knitout must begin with ';!knitout-N'.
			var m = line.match(/^;!knitout-(\d+)$/);
			if (m !== null) {
				if (parseInt(m[1]) != 2) {
					addWarning("Parsed version (" + m.groups(1) + ") is not what was expected.");
				}
			} else {
				addError("Knitout should always start with a '!;knitout-2' line.");
			}
			//nothing more to do with the first line.
			return;
		}

		//comment header lines:
		var m = line.match(/^;;([^:]+): (.*)$/);
		if (m !== null) {
			if (!inCommentHeader) {
				addWarning("Comment-header-like line outside comment header.");
			} else {
				var name = m[1];
				var value = m[2];
				console.log("Comment header: '" + name + "' is '" + value + "'.");
				//TODO: handle comment headers.
				if (name === "Carriers") {
					carrierNames = value.split(" ");
					machine.setCarriers(carrierNames);
					console.log("Carrier names (front-to-back): ", carrierNames);
				}
				return; //nothing left to do with this line.
			}
		} else {
			inCommentHeader = false;
		}

		//split line into op and comment parts:
		var m = line.match(/^([^;]*)(;.*)?$/);
		if (m === null) {
			console.log("Weird, our line regex should have gotten everything.");
			return;
		}
		var tokens = m[1].split(/[ \t]+/);
		var comment = m[2];

		//TODO: handle !source: directive in comment

		//trim leading/trailing whitespace from operation token list:
		if (tokens.length !== 0 && tokens[0] === "") tokens.shift();
		if (tokens.length !== 0 && tokens[tokens.length-1] === "") tokens.pop();

		if (tokens.length === 0) {
			//empty operation: nothing to do
			return;
		}

		var op = tokens.shift();

		function parseCarrierSet(tokens) {
			//check that tokens are in carrierNames and aren't repeated:
			var usedAlready = {};
			tokens.forEach(function(name){
				if (carrierNames.indexOf(name) == -1) {
					throw "Carrier name does not appear in Carriers header.";
				}
				if (name in usedAlready) {
					throw "Carrier name appears twice in carrier set.";
				}
				usedAlready[name] = true;
			});
			return tokens.slice();
		}
		function parseStitchValue(token) {
			if (!/^[-+]?(\.\d+|\d+.\d*|\d+)$/.test(token)) {
				throw "Stitch value [" + token + "] must be a simple floating point value.";
			}
			return parseFloat(token);
		}
		function parseRackingValue(token) {
			if (!/^[-+]?(\.\d+|\d+.\d*|\d+)$/.test(token)) {
				throw "Racking value [" + token + "] must be a simple floating point value.";
			}
			return parseFloat(token);
		}
		function parseDirection(token) {
			if (!(token === '-' || token === '+')) {
				throw "Direction [" + token + "] must be '+' or '-'.";
			}
			return token;
		}
		function parseNeedle(token) {
			if (!/^([fb]s?)([-+]?\d+)$/.test(token)) throw "Needle [" + token + "] must be f,b,fs, or bs followed by an integer.";
			return token;
		}


		//dispatch all basic knitout functions to the machine, catch anything thrown and add to errors:
		try {
			//all the in/out/hook ops take a carrierset as an argument:
			if (["in", "out", "inhook", "releasehook", "outhook"].indexOf(op) !== -1) {
				var cs = parseCarrierSet(tokens);
				machine[op](cs);
			} else if (op === "stitch") {
				if (tokens.length !== 2) throw "stitch takes exactly two arguments";
				var l = parseStitchValue(tokens[0]);
				var t = parseStitchValue(tokens[1]);
				machine.stitch(l, t);
			} else if (op === "rack") {
				if (tokens.length !== 1) throw "rack takes exactly one argument";
				var r = parseRackingValue(tokens[0]);
				machine.rack(r);
			} else if (op === "knit" || op === "drop") {
				if (op === "drop") {
					if (tokens.length !== 1) throw "drop takes exactly one argument";
					//interpret drop as "knit + N":
					tokens.unshift("+");
				}
				if (tokens.length < 2) throw "knit requires at least two arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.knit(d, n, cs);
			} else if (op === "tuck" || op === "amiss") {
				if (op === "amiss") {
					if (tokens.length !== 1) throw "amiss takes exactly one argument";
					tokens.unshift("+");
				}
				if (tokens.length < 2) throw "tuck requires at least two arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.tuck(d, n, cs);
			} else if (op === "split" || op === "xfer") {
				if (op === "xfer") {
					if (tokens.length !== 2) throw "xfer takes exactly two arguments";
					tokens.unshift("+");
				}
				if (tokens.length < 3) throw "split requires at least three arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var n2 = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.split(d, n, n2, cs);
			} else if (op === "miss") {
				if (tokens.length < 2) throw "miss requires at least two arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.miss(d, n, cs);
			} else if (op === "pause") {
				if (tokens.length !== 0) throw "pause takes no arguments";
				machine.pause();
			} else if (op === "x-end") {
				end = true;
			} else {
				if (op.startsWith("x-")) {
					addWarning("Unrecognized extension operation '" + op + "'.");
				} else {
					addError("Unrecognized operation.");
				}
			}
		} catch (e) {
			if (typeof(e) === "string") {
				addError(e);
			} else {
				addError("[error that wasn't a string]");
				throw e;
				//console.log(e); //DEBUG
			}
		}

	});
}

//CardMachine is an abstract knitting machine that records the loop structure of a knitout document:

//Idea:
//Track a bunch of "cards" in "slots"
//"slots" are spaces under needles or between needles.
//"cards" have input and output yarns and loops.


//We'll use slot setup of  ... (2-) 2 (2+) (3-) 3 (3+) ...
var NEEDLE_WIDTH = 1.0;
var NUDGE_WIDTH = 0.2;

//Types of cards:
//- aligned with needles:
//  [bed depth]
//    yarn(s) forward/backward through loop(s)
//    loop(s) from down to forward/backward
//    loop(s) from forward/backward to up
//    loop(s) vertical
//  [carrier depths]
//    loop(s) forward/backward
//- between needles:
//     yarn(s) left/right/forward/backward/up/down to left/right/forward/backward/up/down
//     yarn in/out

function Card() {
	this.height = 1.0;
	this.width = 1.0;
	this.top = this.height; //position of the top of the card.

	//default draw function:
	this.draw = function(ctx, x) {
		ctx.fillStyle = '#888';
		ctx.fillRect(x - 0.5 * this.width, this.top - this.height, this.width, this.height);
		ctx.beginPath();
		ctx.moveTo(x - 0.5 * this.width, this.top - this.height);
		ctx.lineTo(x + 0.5 * this.width, this.top);
		ctx.moveTo(x - 0.5 * this.width, this.top);
		ctx.lineTo(x + 0.5 * this.width, this.top - this.height);
		ctx.strokeStyle = '#ff0';
		ctx.stroke();
	};
}

function makeKnitCard(bed, yarns, loops) {
	console.assert(bed === 'f' || bed === 'b', "Knit must happen on front or back bed");
	console.assert(Array.isArray(yarns) && Array.isArray(loops), "makeKnitCard must have [possibly empty] yarns and loops");

	var card = new Card();
	card.width = NEEDLE_WIDTH;
	card.height = 0.7 * NEEDLE_WIDTH;
	card.top = card.height;
	card.bed = bed; //store what bed knit was made on.

	card.loops = loops;
	card.yarns = yarns;

	card.outLoops = [];
	if (card.yarns.length) {
		card.outLoops = [{card:card, yarns:card.yarns}]; //TODO: figure out what loop objects should actually look like.
	}

	card.draw = function(ctx, x) {

		var d = { x:1.0, y:1.0 };
		d.x *= 0.03 * NEEDLE_WIDTH;
		d.y *= 0.03 * NEEDLE_WIDTH;
		var o = { x:-1.0, y:1.0 };
		o.x *= 0.03 * NEEDLE_WIDTH;
		o.y *= 0.03 * NEEDLE_WIDTH;

		var dy = d.y + o.y;

		function loopTop() {
			if (this.loops.length === 0) return;
			ctx.beginPath();
			ctx.moveTo(x + 0.2 * this.width + d.x + o.x, this.top - 0.5 * this.height + d.y + o.y + dy);
			ctx.lineTo(x - 0.2 * this.width - d.x - o.x, this.top - 0.5 * this.height + d.y + o.y + dy);

			ctx.strokeStyle = '#00f';
			ctx.stroke();
		}

		function yarn() {
			if (this.yarns.length === 0) return;
			ctx.beginPath();
			ctx.moveTo(x - 0.5 * this.width, this.top - 0.5 * this.height - d.y - o.y + dy);
			ctx.lineTo(x - 0.2 * this.width + d.x + o.x, this.top - 0.5 * this.height - d.y - o.y + dy);
			ctx.lineTo(x - 0.2 * this.width + d.x - o.x, this.top - 0.5 * this.height - d.y + o.y + dy);
			ctx.lineTo(x - 0.2 * this.width, this.top);

			ctx.moveTo(x + 0.5 * this.width, this.top - 0.5 * this.height - d.y - o.y + dy);
			ctx.lineTo(x + 0.2 * this.width - d.x - o.x, this.top - 0.5 * this.height - d.y - o.y + dy);
			ctx.lineTo(x + 0.2 * this.width - d.x + o.x, this.top - 0.5 * this.height - d.y + o.y + dy);
			ctx.lineTo(x + 0.2 * this.width, this.top);

			ctx.strokeStyle = '#ff0';
			ctx.stroke();
		}

		function loopBottom() {
			if (this.loops.length === 0) return;
			ctx.beginPath();
			ctx.moveTo(x + 0.2 * this.width, this.top - this.height);
			ctx.lineTo(x + 0.2 * this.width + d.x - o.x, this.top - 0.5 * this.height + d.y - o.y + dy);
			ctx.lineTo(x + 0.2 * this.width + d.x + o.x, this.top - 0.5 * this.height + d.y + o.y + dy);

			ctx.moveTo(x - 0.2 * this.width - d.x - o.x, this.top - 0.5 * this.height + d.y + o.y + dy);
			ctx.lineTo(x - 0.2 * this.width - d.x + o.x, this.top - 0.5 * this.height + d.y - o.y + dy);
			ctx.lineTo(x - 0.2 * this.width, this.top - this.height);

			ctx.strokeStyle = '#00f';
			ctx.stroke();
		}

		if (this.bed === 'f') {
			loopTop.call(this);
			yarn.call(this);
			loopBottom.call(this);
		} else {
			loopBottom.call(this);
			yarn.call(this);
			loopTop.call(this);
		}

	};

	return card;
}


function makeYarnNudgeCard(from,to) {
	console.assert(['left', 'right', 'down', 'in', 'out', '*'].indexOf(from) != -1, "Must have valid 'from'");
	console.assert(['left', 'right', 'up', 'in', 'out', '*'].indexOf(to) != -1, "Must have valid 'to'");

	var card = new Card();
	card.width = NUDGE_WIDTH;
	card.height = NUDGE_WIDTH;
	card.top = card.height;

	card.from = from;
	card.to = to;

	card.draw = function(ctx, x) {
		ctx.beginPath();

		if (this.from === 'left') {
			ctx.moveTo(x - 0.5 * NUDGE_WIDTH, this.top - this.height + 0.5 * NUDGE_WIDTH);
		} else if (this.from === 'right') {
			ctx.moveTo(x + 0.5 * NUDGE_WIDTH, this.top - this.height + 0.5 * NUDGE_WIDTH);
		} else if (this.from === 'down') {
			ctx.moveTo(x, this.top - this.height);
		} else if (this.from === 'in' || this.from === 'out') {
			ctx.moveTo(x, this.top - this.height + 0.5 * NUDGE_WIDTH);
		}
		ctx.lineTo(x, this.top - this.height + 0.5 * NUDGE_WIDTH);
		ctx.lineTo(x, this.top - 0.5 * NUDGE_WIDTH);

		if (this.to === 'left') {
			ctx.lineTo(x - 0.5 * NUDGE_WIDTH, this.top - 0.5 * NUDGE_WIDTH);
		} else if (this.to === 'right') {
			ctx.lineTo(x + 0.5 * NUDGE_WIDTH, this.top - 0.5 * NUDGE_WIDTH);
		} else if (this.to === 'up') {
			ctx.lineTo(x, this.top);
		} else if (this.to === 'in' || this.to === 'out' || this.to === '*') {
			ctx.lineTo(x, this.top - 0.5 * NUDGE_WIDTH);
		}

		ctx.strokeStyle = '#ff0';
		ctx.stroke();
	};

	return card;
}

function makeMissCard(bed, from,to, loops) {
	console.assert(bed === 'f' || bed === 'b', "Miss must happen on front or back bed"); //TODO: I could see us missing on sliders, perhaps.
	console.assert( (from === 'left' && to === 'right') || (from === 'right' && to === 'left'), "makeMissCard doesn't really have many options");
	console.assert(Array.isArray(loops), "makeMissCard must have [possibly empty] loops");

	var card = new Card();
	card.width = NEEDLE_WIDTH;
	card.height = NUDGE_WIDTH;
	card.top = card.height;

	card.bed = bed;
	card.loops = loops;
	card.outLoops = [];

	//TODO: figure out what we actually want to store in outLoops anyway
	card.loops.forEach(function(l, li){
		card.outLoops = [{card:card, loop:li}];
	});

	card.draw = function(ctx, x) {
		function drawYarn() {
			ctx.beginPath();
			ctx.moveTo(x - 0.5 * this.width, this.top - 0.5 * this.height);
			ctx.lineTo(x + 0.5 * this.width, this.top - 0.5 * this.height);

			ctx.strokeStyle = '#ff0';
			ctx.stroke();
		}

		function drawLoops() {
			if (this.loops.length === 0) return;
			ctx.beginPath();
			ctx.moveTo(x - 0.2 * this.width, this.top - this.height);
			ctx.lineTo(x - 0.2 * this.width, this.top);
			ctx.moveTo(x + 0.2 * this.width, this.top - this.height);
			ctx.lineTo(x + 0.2 * this.width, this.top);

			ctx.strokeStyle = '#00f';
			ctx.stroke();
		}

		if (this.bed === 'f') {
			drawYarn.call(this);
			drawLoops.call(this);
		} else {
			drawLoops.call(this);
			drawYarn.call(this);
		}
	};


	return card;
}



function RecordMachine() {
	//layers for each bed and -- eventually -- carrier:
	this.layers = { "b":[], "bs":[], "fs":[], "f":[] };

	//name -> carriers map starts empty:
	this.carriers = {};

	//beds start aligned:
	this.racking = 0.0;
	//stitch values start zeroed:
	this.stitchValues = [0.0, 0.0];
}

//'n' is a needle index, d is an optional nudge.
RecordMachine.prototype.getSlot = function(layerName, idx, d) {
	console.assert(layerName in this.layers, "getSlot should be called on layers that exist.");
	var layer = this.layers[layerName];

	var slotName;
	if (typeof(d) === 'undefined') {
		slotName = idx;
	} else {
		if (d === '+') {
			slotName = idx + "+";
		} else if (d === '-') {
			slotName = idx + "-";
		} else {
			console.assert(false, "d should be '+','-', or undefined");
		}
	}
	if (!(slotName in layer)) {
		layer[slotName] = [];
	}
	return layer[slotName];
};

//set the carriers in front-to-back order; carriers start out of action at the right:
RecordMachine.prototype.setCarriers = function(cs) {
	this.carriers = {};
	cs.forEach(function(n, i){
		this.layers["c:" + n] = []; //add layer for carrier

		this.carriers[n] = {
			// lastSlot:slotName <-- if in.
			// mark: <-- if marked to come in.
		};
	}, this);
};

//helper to split needle into bed, slider, index:
function parseNeedle(n) {
	var m = n.match(/^([fb])(s?)([-+]?\d+)$/);
	console.assert(m !== null, "needle should always be parseable");
	return {
		bed:m[1],
		slider:(m[2] === "s"),
		index:parseInt(m[3])
	};
}

function parseSlot(slotName) {
	var m = slotName.match(/^(-?\d+)([+-]?)$/);
	console.assert(m !== null, "slotName [" + slotName + "] should always be parseable");
	return {
		index:parseInt(m[1]),
		nudge:m[2]
	};
}

/*
RecordMachine.prototype.markIn = function(cs, hook) {
	//check parameters:
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (c.yarn) throw "Carrier [" + cn + "] is already in action.";
		if (c.mark) throw "Carrier [" + cn + "] is already marked to come in.";
	}, this);
	//mark carriers:
	var mark = {
		cs:cs.slice(),
		hook:hook
	};
	cs.forEach(function(cn){
		this.carriers[cn].mark = mark;
	}, this);
};

RecordMachine.prototype.bringInIfNeeded = function(d, n, cs) {
	//if any carrier hasn't made a stitch, then need to bring them (all) in:
	var needIn = false;
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.yarn) needIn = true;
	}, this);
	if (!needIn) return;

	//check that cs is marked for in, and that mark *matches*:
	var mark = null;
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.mark) throw "Carrier [" + cn + "] is not marked to come in.";
		if (mark === null) mark = c.mark;
		if (JSON.stringify(c.mark.cs) !== JSON.stringify(cs)) throw "Carrier [" + cn + "] is not marked to come in as part of carrier set " + JSON.stringify(cs) + ".";
		console.assert(mark === c.mark, "marks on the same carrier set should always match");
	}, this);

	//'at' is where the hook parks (and where the carriers begin):
	// (that is, just before 'n' in direction 'd')
	var bsi = parseNeedle(n);
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? -0.5 : 0.5) + (bsi.bed === 'b' ? this.racking : 0.0) );

	//move carriers, create yarn, remove mark:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		c.guide.points.forEach(function(p){ p.x = at; });

		delete c.mark;

		var yarn = new Yarn();
		yarn.insertGuide(null, c.guide, '+');
		c.yarn = yarn;
		this.yarns.push(yarn);
	}, this);

	//create a new holding hook, if needed:
	if (mark.hook) {
		var hook = {
			at:at,
			cs:cs.slice()
		};
		cs.forEach(function(cn){
			this.carriers[cn].hook = hook;
		}, this);
	}
}

RecordMachine.prototype.bringOut = function(cs, hook) {
	//check that all carriers are actually in, are not in a hook, and have knit something:
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.last) throw "Carrier [" + cn + "] is not in action.";
		if (c.hook) throw "Carrier [" + cn + "] is in a holding hook.";
		if (c.mark) throw "Carrier [" + cn + "] is marked to come in.";
	}, this);
	//TODO: sanity check that when using hook there's a reasonable place to park it?

	//take carriers out:
	cs.forEach(function(cn){
		var c = this.carriers[cn];

		c.guide.points.forEach(function(p){ p.x = Infinity; });

		console.assert(c.yarn.tail === c.guide, "yarn still attached.");
		c.yarn.eraseSegment(c.yarn.tail);

		//TODO: disconnect from yarn
	}, this);
};*/

RecordMachine.prototype.in = function(cs) { /*this.markIn(cs, false);*/ };
RecordMachine.prototype.inhook = function(cs) { /*this.markIn(cs, true);*/ };

RecordMachine.prototype.releasehook = function(cs) {
/*
	//check that all of 'cs' is held in the same hook:
	var hook = null;
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.hook) throw "Carrier [" + cn + "] is not in a hook.";
		if (hook === null) hook = c.hook;
		if (JSON.stringify(c.hook.cs) !== JSON.stringify(cs)) throw "Carrier [" + cn + "] is not in a hook with carrier set " + JSON.stringify(cs) + ".";
		console.assert(hook === c.hook, "hooks on the same carrier set should always match");
	}, this);

	//remove from hook:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		delete c.hook;
	}, this);
*/
};
RecordMachine.prototype.out = function(cs) { /* this.bringOut(cs, false); */ }
RecordMachine.prototype.outhook = function(cs) { /* this.bringOut(cs, true); */ }

RecordMachine.prototype.stitch = function(l, t) {
	this.stitchValues = {l:l, t:t};
};
RecordMachine.prototype.rack = function(r) {
	this.racking = r;
};

/*
RecordMachine.prototype.moveCarriers = function(d, n, cs) {
	var bsi = parseNeedle(n);
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? -0.5 : 0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);
};
*/

RecordMachine.prototype.knit = function(d, n, cs) {
	var bsi = parseNeedle(n);
	if (bsi.slider) throw "Can't knit on a slider.";

	var cards = []; //cards and the stacks to add them on -- used to compute yarnY.
	var flex = null; //card to adjust height of to match yarnY. (it's always a nudge-stack card)

	//flush current list of cards and flex to stacks:
	function stackCards() {
		//Figure out y-coordinate and add cards to stacks:
		var yarnY = 0.0;
		if (flex) {
			yarnY = Math.max(yarnY, flex.top - 0.5 * NUDGE_WIDTH);
		}
		cards.forEach(function(cs){
			var card = cs[0];
			var stack = cs[1];
			if (stack.length) {
				yarnY = Math.max(yarnY, stack[stack.length-1].top + 0.5 * card.height);
			}
		});
		cards.forEach(function(cs){
			var card = cs[0];
			var stack = cs[1];
			card.top = yarnY + 0.5 * card.height;
			stack.push(card);
		});

		if (flex) {
			flex.height = yarnY + 0.5 * NUDGE_WIDTH - (flex.top - flex.height);
			flex.top = yarnY + 0.5 * NUDGE_WIDTH;
		}

		cards = [];
		flex = null;
	}

	//Build yarn cards over to proper needle:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		if (!('lastCard' in c)) {
			//bringing in a yarn:
			c.yarn = {};
			var card = 	makeYarnNudgeCard('*', (d === '+' ? 'right' : 'left'));
			var slot = this.getSlot(bsi.bed, bsi.index, (d === '+' ? '-' : '+'));
			cards.push([card, slot]);
			return;
		}

		//need to create cards from c.lastSlot to starting slot.
		var s = {index:c.lastSlot.index, nudge:c.lastSlot.nudge};
		var t = {index: bsi.index, nudge:(d === '+' ? '-' : '+')};

		function slotToIndex(s) {
			var si = s.index * 3 + 1;
			if (s.nudge !== '') si += (s.nudge === '+' ? 1 : -1);

			var test = indexToSlot(si);
			console.assert(test.index === s.index && test.nudge === s.nudge, "slotToIndexToSlot should be okay");

			return si;
		}
		function indexToSlot(idx) {
			return {
				index:Math.floor(idx / 3),
				nudge:['-','','+'][idx % 3]
			};
		}

		//Rather that being general to start with, I'll try to handle some well-defined cases:
		//NOTE: I'm assuming that c.lastCard is already at the top of its stack
		if (c.lastSlot.bed === bsi.bed) {
			var si = slotToIndex(s);
			var ti = slotToIndex(t);
			if (si < ti) {
				if (c.lastCard) {
					c.lastCard.to = 'right';
					flex = c.lastCard;
				}
				for (var idx = si + 1; idx <= ti; ++idx) {
					var slot = indexToSlot(idx);
					if (slot.nudge === '') {
						var slot = this.getSlot(bsi.bed, slot.index);
						cards.push([
							makeMissCard(bsi.bed, 'left', 'right', (slot.length == 0 ? [] : slot[slot.length-1].outLoops) ),
							slot
						]);
					} else {
						//NOTE: this may capture a yarn!
						cards.push([
							c.lastCard = makeYarnNudgeCard('left', 'right'),
							this.getSlot(bsi.bed, slot.index, slot.nudge)
						]);
					}
				}
			} else if (si > ti) {
				if (c.lastCard) {
					c.lastCard.to = 'left';
					flex = c.lastCard;
				}
				for (var idx = si - 1; idx >= ti; --idx) {
					var slot = indexToSlot(idx);
					if (slot.nudge === '') {
						var slot = this.getSlot(bsi.bed, slot.index);
						cards.push([
							makeMissCard(bsi.bed, 'right', 'left', (slot.length == 0 ? [] : slot[slot.length-1].outLoops)),
							slot
						]);
					} else {
						//NOTE: this may capture a yarn!
						cards.push([
							c.lastCard = makeYarnNudgeCard('right', 'left'),
							this.getSlot(bsi.bed, slot.index, slot.nudge)
						]);
					}
				}
			}

			//handle U-turn:
			//(note: could probably detect and avoid stackCards when lastCard is 'from' the opposite of d)
			stackCards.call(this);
			if (c.lastCard) {
				c.lastCard.to = (d === '+' ? 'right' : 'left');
				flex = c.lastCard;
			}
		}
	}, this);

	var yarns = [];
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		yarns.push(c.yarn);
	}, this);
	
	//Build a knit card on the proper needle:
	(function(){
		var stack = this.getSlot(bsi.bed, bsi.index);
		var loops = [];
		if (stack.length !== 0) {
			loops = stack[stack.length-1].outLoops;
		}
		var card = makeKnitCard(bsi.bed, yarns, loops);
		cards.push([card, stack]);
	}).call(this);

	//Build an output yarn card:
	(function(){
		if (cs.length === 0) return;
		var card = makeYarnNudgeCard((d === '+' ? 'left' : 'right'), '*', yarns);
		var stack = this.getSlot(bsi.bed, bsi.index, d);
		cards.push([card, stack]);

		cs.forEach(function(cn){
			var c = this.carriers[cn];
			c.lastSlot = {bed:bsi.bed, index:bsi.index, nudge:d};
			c.lastCard = card;
		}, this);
	}).call(this);


	//Put the rest of the cards on stacks:
	stackCards.call(this);

	/*
	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//move carriers into position (TODO: make yarn overlaps)
	this.moveCarriers(d, n, cs);

	//Grab the card for this needle:
	var needle = this.getNeedle(n);

	//Figure out if needle beds need shoving:
	if (needle.horizonY + 1.5 * LOOP_HEIGHT + LOOP_PADDING > this.needlesY) {
		this.needlesY = needle.horizonY + 1.5 * LOOP_HEIGHT + LOOP_PADDING;
		['b','bs','fs','f'].forEach(function(n){
			this.needleBeds[n].y = this.needlesY;
		}, this);
		this.carrierBed.y = this.needlesY;
	}
	needle.horizonY = this.needlesY - 0.5 * LOOP_HEIGHT;

	//make knit-shaped card:
	var knit = makeKnitCard(this.beds[bsi.bed + (bsi.slider ? 's' : '')], bsi.index, needle.horizonY - 0.5 * LOOP_HEIGHT, (bsi.bed === 'f' ? 1.0 :-1.0));

	//Re-route segments through knit's loop:
	knit.loop.segments = needle.loop.segments;
	needle.loop.segments = [];

	//adjust pointers:
	knit.loop.segments.forEach(function(segment){
		segment.guide = knit.loop;
	});

	//form new loop:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "yarn connected to carrier");
		if (d === '+') {
			c.yarn.insertGuide(c.yarn.tail, knit.leftYarn, '+');
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '+');
			c.yarn.insertGuide(c.yarn.tail, knit.rightYarn, '+');
		} else {
			c.yarn.insertGuide(c.yarn.tail, knit.rightYarn, '-');
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '-');
			c.yarn.insertGuide(c.yarn.tail, knit.leftYarn, '-');
		}
		console.assert(c.yarn.tail.guide === c.guide, "yarn still connected to carrier");
	}, this);

	//move carriers to other side of stitch:
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? 0.5 : -0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);
	*/
};
RecordMachine.prototype.tuck = function(d, n, cs) {
	var bsi = parseNeedle(n);
	if (bsi.slider) throw "Can't knit on a slider.";

/*
	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//move carriers into position (TODO: make yarn overlaps)
	this.moveCarriers(d, n, cs);

	//Grab the card for this needle:
	var needle = this.getNeedle(n);

	//TODO: add a some 'tuck-like' yarn guides into the mix

	//form new loop:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "yarn connected to carrier");
		if (d === '+') {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '+');
		} else {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '-');
		}
		console.assert(c.yarn.tail.guide === c.guide, "yarn still connected to carrier");
	}, this);

	//move carriers to other side of stitch:
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? 0.5 : -0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);

	*/

};
RecordMachine.prototype.split = function(d, n, n2, cs) {
	var bsi = parseNeedle(n);
	var bsi2 = parseNeedle(n2);
	if (bsi.slider && cs.length) throw "Can't split from a slider.";
	if (bsi.slider && bsi2.slider) throw "Can't transfer slider-to-slider.";

/*
	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//move carriers into position (TODO: make yarn overlaps)
	this.moveCarriers(d, n, cs);

	//Grab the card for this needle:
	var needle = this.getNeedle(n);

	//TODO: add a some 'tuck-like' yarn guides into the mix

	//form new loop:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "yarn connected to carrier");
		if (d === '+') {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '+');
		} else {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '-');
		}
		console.assert(c.yarn.tail.guide === c.guide, "yarn still connected to carrier");
	}, this);

	//move carriers to other side of stitch:
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? 0.5 : -0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);

	*/
};

RecordMachine.prototype.miss = function(d, n, cs) {
};

RecordMachine.prototype.pause = function() {
};


//create an canvas from stacks:
RecordMachine.prototype.drawStacks = function() {
	var canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;

	var minX = Infinity;
	var maxX =-Infinity;
	var minY = Infinity;
	var maxY =-Infinity;

	function slotX(slotName) {
		var s = parseSlot(slotName);
		var x = s.index * (NEEDLE_WIDTH + 2.0 * NUDGE_WIDTH)
		if (s.nudge === "+") {
			x += 0.5 * NEEDLE_WIDTH + 0.5 * NUDGE_WIDTH;
		} else if (s.nudge === "-") {
			x -= 0.5 * NEEDLE_WIDTH + 0.5 * NUDGE_WIDTH;
		}
		return x;
	}

	["bs","b","fs","f"].forEach(function(layerName){
		var layer = this.layers[layerName];
		for (var slotName in layer) {
			var slot = layer[slotName];
			if (slot.length != 0) {
				var x = slotX(slotName);
				minX = Math.min(minX, x - 0.5 * slot[0].width);
				maxX = Math.max(maxX, x + 0.5 * slot[0].width);
				minY = Math.min(minY, slot[0].top - slot[0].height);
				maxY = Math.max(maxY, slot[slot.length-1].top);
			}
		}
	}, this);
	console.log("Slots are in [" + minX + "," + maxX + "]x[" + minY + "," + maxY + "]");

	var ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f0f';
	ctx.fillRect(0,0,500,500);

	var s = Math.min(
		500 / (maxX - minX + NEEDLE_WIDTH),
		500 / (maxY - minY + NEEDLE_WIDTH)
	);

	var px = 2.0 / s;

	ctx.lineWidth = px;
	ctx.setTransform( s,0, 0,-s, 250 - 0.5 * (maxX + minX) * s, 250 + 0.5 * (maxY + minY) * s );
	["bs","b","fs","f"].forEach(function(layerName){
		var layer = this.layers[layerName];
		for (var slotName in layer) {
			var slot = layer[slotName];
			var x = slotX(slotName);
			var prev = null;
			slot.forEach(function(card){
				card.draw(ctx, x);

				if (prev && prev.outLoops && prev.outLoops.length) {
					console.assert(card.loops && card.loops.length, "outLoops imply inLoops");
					ctx.beginPath();
					ctx.moveTo(x - 0.2 * card.width, card.top - card.height);
					ctx.lineTo(x - 0.2 * prev.width, prev.top);
					ctx.moveTo(x + 0.2 * card.width, card.top - card.height);
					ctx.lineTo(x + 0.2 * prev.width, prev.top);

					ctx.strokeStyle = '#808';
					ctx.stroke();
				}
				prev = card;

			});
		}
	}, this);


	return canvas;
};

//replace the element 'toReplace' in the document with an interactive visualization of the knitout code in 'codeText':
function replaceElement(toReplace, codeText) {
	var container = document.createElement('div');
	container.classList.add("knitout");

	var code = document.createElement('code');
	container.appendChild(code);


	//TODO: nice syntax highlighting?
	var machine = new RecordMachine();

	parseKnitout(codeText, machine);

	var picture = document.createElement('div');
	picture.appendChild(machine.drawStacks());

	container.appendChild(picture);


	toReplace.replaceWith(container);
}

//find blocks of <pre><code class="knitout"> ... </code></pre>, and pass to replaceElement:
function init() {
	var elts = document.getElementsByClassName("knitout");
	for (var i = 0; i < elts.length; ++i) {
		var elt = elts[i];
		if (elt.tagName !== 'CODE') continue;
		var p = elt.parentNode;
		if (!p || p.tagName !== 'PRE') continue;
		if (elt.previousSibling !== null || elt.nextSibling !== null) {
			console.log("Skipping <pre><code class=\"knitout\"> block with nodes between <pre> and <code> tags.");
			continue;
		}
		if (elt.children.length !== 0) {
			console.log("Skipping <pre><code class=\"knitout\"> block with inner HTML.");
			continue;
		}
		console.log("Will do element:",elt);

		replaceElement(elt.parentNode, elt.innerText);
	}

}

init();


/*})(); */
