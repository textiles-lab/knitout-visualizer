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

//yarn is a linked list of locations, also a color:
function Yarn() {
	this.first = null;
	this.last = null;
	this.color = "#ff8800";

	this.freeID = 0;
}

Yarn.prototype.addPoint = function(before,  card, x, y) {
	var point = new YarnPoint(this, card, x, y);
	point.next = before;
	point.prev = (before !== null ? before.prev : this.last);
	if (point.next !== null) {
		point.next.prev = point;
	} else {
		console.assert(this.last === point.prev, "Point at last is properly linked.");
		this.last = point;
	}
	if (point.prev !== null) {
		point.prev.next = point;
	} else {
		console.assert(this.first === point.next, "Point at first is properly linked.");
		this.first = point;
	}
	return point;
};

Yarn.prototype.log = function() {
	var str = "";
	for (var pt = this.first; pt !== null; pt = pt.next) {
		if (str != "") str += " ";
		str += pt.ID.toString();
	}
	console.log("Yarn " + this.color + " " + str);
};

//yarn point is a location along a yarn (thus in a card):
function YarnPoint(yarn, card, x, y) {
	this.yarn = yarn;

	this.ID = this.yarn.freeID++;

	this.prev = null;
	this.next = null;

	this.card = card;
	this.x = x;
	this.y = y;
}

//loop is two yarn points
function Loop(left, right) {
	console.assert(left.yarn === right.yarn, "Loops are made of the same yarn.");
	this.yarn = left.yarn;

	this.left = left;
	this.right = right;
}

//given a loop with left and right points adjacent in a yarn, splice left[0]...left[n] right[n] ... right[0] into the yarn between them, and return the new loop:
Loop.prototype.addPoints = function(card, left, right) {
	if (this.left.next === this.right) {
		var l = this.left;
		left.forEach(function(pt){
			l = this.yarn.addPoint(l.next,  card, pt.x, pt.y);
		}, this);

		var r = this.right;
		right.forEach(function(pt){
			r = this.yarn.addPoint(r,  card, pt.x, pt.y);
		}, this);

		return new Loop(l, r);
	} else if (this.right.next === this.left) {
		var l = this.left;
		left.forEach(function(pt){
			l = this.yarn.addPoint(l,  card, pt.x, pt.y);
		}, this);

		var r = this.right;
		right.forEach(function(pt){
			r = this.yarn.addPoint(r.next,  card, pt.x, pt.y);
		}, this);

		return new Loop(l, r);

	} else {
		console.assert(false, "Cannot addPoints to a loop that has internal points.");
	}
};

function loopsToString(loops) {
	var info = "";
	info += "[";
	loops.forEach(function(loop){
		info += " (" + loop.left.ID;
		if (loop.left.next === loop.right || loop.right.next === loop.left) {
			info += ",";
		} else {
			info += "...";
		}
		info += loop.right.ID + ")";
	});
	info += " ]";
	return info;
}

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
		ctx.globalAlpha = 0.5;
		if (this.bg) {
			ctx.fillStyle = this.bg;
		} else {
			ctx.fillStyle = '#222';
		}
		ctx.fillRect(x - 0.5 * this.width, this.top - this.height, this.width, this.height);
		function r() { return (Math.random() - 0.5) * 0.1; }
		ctx.beginPath();
		ctx.moveTo(x - 0.5 * this.width + r(), this.top - this.height + r());
		ctx.lineTo(x + 0.5 * this.width + r(), this.top + r());
		ctx.moveTo(x - 0.5 * this.width + r(), this.top + r());
		ctx.lineTo(x + 0.5 * this.width + r(), this.top - this.height + r());
		ctx.strokeStyle = '#ff0';
		ctx.stroke();
		ctx.globalAlpha = 1.0;
	};
}

function makeKnitCard(direction, bed, yarns, loops) {
	console.assert(direction === '+' || direction === '-', "Knit must happen in + or - direction");
	console.assert(bed === 'f' || bed === 'b', "Knit must happen on front or back bed");
	console.assert(Array.isArray(yarns) && Array.isArray(loops), "makeKnitCard must have [possibly empty] yarns and loops");
	yarns.forEach(function(yarn){ console.assert(yarn instanceof Yarn, "Yarns array should contain yarns."); });
	loops.forEach(function(loop){ console.assert(loop instanceof Loop, "Loops array should contain loops."); });

	var card = new Card();
	card.width = NEEDLE_WIDTH;
	card.height = 0.7 * NEEDLE_WIDTH;
	card.top = card.height;
	card.direction = direction; //store what direction the stitch was made in
	card.bed = bed; //store what bed the stitch was made on

	card.yarns = yarns.slice();
	card.loops = loops.slice();

	//d/o/dy change loop shape:
	var d = { x:1.0, y:1.0 };
	d.x *= 0.03 * NEEDLE_WIDTH;
	d.y *= 0.03 * NEEDLE_WIDTH;
	var o = { x:-1.0, y:1.0 };
	o.x *= 0.03 * NEEDLE_WIDTH;
	o.y *= 0.03 * NEEDLE_WIDTH;
	var dy = d.y + o.y;

	//add points to loops:
	loops.forEach(function(loop){
		//returned loop is ignored (loop is finished)
		loop.addPoints(card, [
			{x: -0.2 * card.width, y: -0.5 * card.height },
			{x: -0.2 * card.width - d.x + o.x, y: d.y - o.y + dy },
			{x: -0.2 * card.width - d.x - o.x, y: d.y + o.y + dy }
		],[
			{x: 0.2 * card.width, y: -0.5 * card.height },
			{x: 0.2 * card.width + d.x - o.x, y: d.y - o.y + dy },
			{x: 0.2 * card.width + d.x + o.x, y: d.y + o.y + dy }
		]);
	});

	card.outLoops = [];
	yarns.forEach(function(yarn){
		var l, r;
		if (direction === '+') {
			yarn.addPoint(null,  card, - 0.5 * card.width, - d.y - o.y + dy);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x + o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x - o.x, - d.y + o.y + dy);
			l = yarn.addPoint(null,  card, - 0.2 * card.width, 0.5 * card.height);

			r = yarn.addPoint(null,  card, + 0.2 * card.width, 0.5 * card.height);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x + o.x, - d.y + o.y + dy);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x - o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, + 0.5 * card.width, - d.y - o.y + dy);
		} else { //direction === '-'
			yarn.addPoint(null,  card, + 0.5 * card.width, - d.y - o.y + dy);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x - o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x + o.x, - d.y + o.y + dy);
			r = yarn.addPoint(null,  card, + 0.2 * card.width, 0.5 * card.height);

			l = yarn.addPoint(null,  card, - 0.2 * card.width, 0.5 * card.height);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x - o.x, - d.y + o.y + dy);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x + o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, - 0.5 * card.width, - d.y - o.y + dy);
		}
		card.outLoops.push(new Loop(l, r));
	});

	return card;
}

function makeTuckCard(direction, bed, yarns, loops) {
	console.assert(direction === '+' || direction === '-', "Tuck must happen in + or - direction");
	console.assert(bed === 'f' || bed === 'b', "Tuck must happen on front or back bed");
	console.assert(Array.isArray(yarns) && Array.isArray(loops), "makeTuckCard must have [possibly empty] yarns and loops");
	yarns.forEach(function(yarn){ console.assert(yarn instanceof Yarn, "Yarns array should contain yarns."); });
	loops.forEach(function(loop){ console.assert(loop instanceof Loop, "Loops array should contain loops."); });

	var card = new Card();
	card.width = NEEDLE_WIDTH;
	card.height = 0.7 * NEEDLE_WIDTH;
	card.top = card.height;
	card.direction = direction; //store what direction the stitch was made in
	card.bed = bed; //store what bed the stitch was made on

	card.yarns = yarns.slice();
	card.loops = loops.slice();

	//d/o/dy change loop shape:
	var d = { x:1.0, y:1.0 };
	d.x *= 0.03 * NEEDLE_WIDTH;
	d.y *= 0.03 * NEEDLE_WIDTH;
	var o = { x:-1.0, y:1.0 };
	o.x *= 0.03 * NEEDLE_WIDTH;
	o.y *= 0.03 * NEEDLE_WIDTH;
	var dy = d.y + o.y;

	card.outLoops = [];

	function doLoops() {
		loops.forEach(function(loop){
			//returned loop is ignored (loop is finished)
			card.outLoops.push(loop.addPoints(card, [
				{x: -0.2 * card.width, y: -0.5 * card.height },
				{x: -0.2 * card.width, y: 0.5 * card.height },
			],[
				{x: 0.2 * card.width, y: -0.5 * card.height },
				{x: 0.2 * card.width, y: 0.5 * card.height },
			]));
		});
	}

	if (card.bed === 'b') doLoops();

	yarns.forEach(function(yarn){
		var l, r;
		if (direction === '+') {
			yarn.addPoint(null,  card, - 0.5 * card.width, - d.y - o.y + dy);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x + o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x - o.x, - d.y + o.y + dy);
			l = yarn.addPoint(null,  card, - 0.2 * card.width, 0.5 * card.height);

			r = yarn.addPoint(null,  card, + 0.2 * card.width, 0.5 * card.height);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x + o.x, - d.y + o.y + dy);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x - o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, + 0.5 * card.width, - d.y - o.y + dy);
		} else { //direction === '-'
			yarn.addPoint(null,  card, + 0.5 * card.width, - d.y - o.y + dy);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x - o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, + 0.2 * card.width - d.x + o.x, - d.y + o.y + dy);
			r = yarn.addPoint(null,  card, + 0.2 * card.width, 0.5 * card.height);

			l = yarn.addPoint(null,  card, - 0.2 * card.width, 0.5 * card.height);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x - o.x, - d.y + o.y + dy);
			yarn.addPoint(null,  card, - 0.2 * card.width + d.x + o.x, - d.y - o.y + dy);
			yarn.addPoint(null,  card, - 0.5 * card.width, - d.y - o.y + dy);
		}
		card.outLoops.push(new Loop(l, r));
	});

	if (card.bed === 'f') doLoops();

	return card;
}


function makeYarnNudgeCard(from,to, yarns, bg) {
	console.assert(['left', 'right', 'down', 'in', 'out', '*'].indexOf(from) != -1, "Must have valid 'from'");
	console.assert(['left', 'right', 'up', 'in', 'out', '*'].indexOf(to) != -1, "Must have valid 'to'");
	console.assert(Array.isArray(yarns), "Yarns must be array.");
	yarns.forEach(function(yarn){ console.assert(yarn instanceof Yarn, "Yarns array should contain yarns."); });

	var card = new Card();
	card.width = NUDGE_WIDTH;
	card.height = NUDGE_WIDTH;
	card.top = card.height;

	if (typeof(bg) !== 'undefined') card.bg = bg;

	card.from = from;
	card.to = '*';

	card.flexPoints = [];

	yarns.forEach(function(yarn){
		if (card.from === 'left') {
			card.flexPoints.push({
				ax:-0.5, ay:-0.5, ox:0.0, oy:0.5 * NUDGE_WIDTH, pt:yarn.addPoint(null,  card, 0.0, 0.0)
			});
			card.flexPoints.push({
				ax: 0.0, ay:-0.5, ox:0.0, oy:0.5 * NUDGE_WIDTH, pt:yarn.addPoint(null,  card, 0.0, 0.0)
			});
		} else if (card.from === 'right') {
			card.flexPoints.push({
				ax: 0.5, ay:-0.5, ox:0.0, oy:0.5 * NUDGE_WIDTH, pt:yarn.addPoint(null,  card, 0.0, 0.0)
			});
			card.flexPoints.push({
				ax: 0.0, ay:-0.5, ox:0.0, oy:0.5 * NUDGE_WIDTH, pt:yarn.addPoint(null,  card, 0.0, 0.0)
			});
		} else if (card.from === 'down') {
			card.flexPoints.push({
				ax: 0.0, ay:-0.5, ox:0.0, oy:0.0, pt:yarn.addPoint(null,  card, 0.0, 0.0)
			});
		} else if (card.from === 'in' || card.from === 'out') {
			card.flexPoints.push({
				ax: 0.0, ay:-0.5, ox:0.0, oy:0.5 * NUDGE_WIDTH, pt:yarn.addPoint(null,  card, 0.0, 0.0)
			});
		}
		card.flexPoints.push({
			ax: 0.0, ay:0.0, ox:0.0, oy:0.0, pt:yarn.addPoint(null,  card, 0.0, 0.0)
		});

		//will set these with 'setTo' later:

		card.flexPoints.push({
			tag:"a", ax: 0.0, ay:0.0, ox:0.0, oy:0.0, pt:yarn.addPoint(null,  card, 0.0, 0.0)
		});
		card.flexPoints.push({
			tag:"b", ax: 0.0, ay:0.0, ox:0.0, oy:0.0, pt:yarn.addPoint(null,  card, 0.0, 0.0)
		});

	});

	//adjust all points relative to current width/height:
	card.flex = function() {
		this.flexPoints.forEach(function(f){
			f.pt.x = this.width * f.ax + f.ox;
			f.pt.y = this.height * f.ay + f.oy;
		}, this);
	};

	card.setTo = function(to) {
		//console.assert(this.to === '*', "must only call setTo on a to-carrier card.");
		this.to = to;
		var a,b; //last two points of each yarn
		if (this.to === 'left') {
			a = { ax: 0.0, ay:0.5, ox:0.0, oy:-0.5 * NUDGE_WIDTH };
			b = { ax:-0.5, ay:0.5, ox:0.0, oy:-0.5 * NUDGE_WIDTH };
		} else if (card.to === 'right') {
			a = { ax:0.0, ay:0.5, ox:0.0, oy:-0.5 * NUDGE_WIDTH };
			b = { ax:0.5, ay:0.5, ox:0.0, oy:-0.5 * NUDGE_WIDTH };
		} else if (card.to === 'up') {
			a = { ax:0.0, ay:0.5, ox:0.0, oy:0.0 };
			b = { ax:0.0, ay:0.5, ox:0.0, oy:0.0 };
		} else if (card.to === 'in' || card.to === 'out' || card.to === '*') {
			a = { ax: 0.0, ay:0.5, ox:0.0, oy:-0.5 * NUDGE_WIDTH };
			b = { ax: 0.0, ay:0.5, ox:0.0, oy:-0.5 * NUDGE_WIDTH };
		}
		this.flexPoints.forEach(function(f){
			if (f.tag === 'a') {
				f.ax = a.ax; f.ay = a.ay; f.ox = a.ox; f.oy = a.oy;
			} else if (f.tag === 'b') {
				f.ax = b.ax; f.ay = b.ay; f.ox = b.ox; f.oy = b.oy;
			}
		});
		this.flex();
	};

	card.setTo(to);

	card.flex(); //do initial layout

	card.oldDraw = card.draw;

	card.draw = function(ctx, x) {
		//this.oldDraw(ctx, x); //DEBUG
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

		ctx.strokeStyle = '#f0f';
		ctx.stroke();
	};

	return card;
}

function makeMissCard(direction, bed, yarns, loops) {
	console.assert(direction === '+' || direction === '-', "Miss must happen in + or - direction");
	console.assert(bed === 'f' || bed === 'b', "Miss must happen on front or back bed");
	console.assert(Array.isArray(yarns) && Array.isArray(loops), "Miss must have [possibly empty] yarns and loops");
	yarns.forEach(function(yarn){ console.assert(yarn instanceof Yarn, "Yarns array should contain yarns."); });
	loops.forEach(function(loop){ console.assert(loop instanceof Loop, "Loops array should contain loops."); });


	var card = new Card();
	card.width = NEEDLE_WIDTH;
	card.height = NUDGE_WIDTH;
	card.top = card.height;

	card.direction = direction;
	card.bed = bed;
	card.loops = loops;
	card.yarns = yarns;

	card.outLoops = [];

	card.loops.forEach(function(loop){
		card.outLoops.push(loop.addPoints(card,[
			{x: -0.2 * card.width, y: -0.5 * card.height},
			{x: -0.2 * card.width, y:  0.5 * card.height}
		],[
			{x:  0.2 * card.width, y: -0.5 * card.height},
			{x:  0.2 * card.width, y:  0.5 * card.height}
		]));
	});

	card.yarns.forEach(function(yarn){
		if (direction === '+') {
			yarn.addPoint(null,  card, -0.5 * card.width, 0.0);
			yarn.addPoint(null,  card,  0.5 * card.width, 0.0);
		} else {
			yarn.addPoint(null,  card,  0.5 * card.width, 0.0);
			yarn.addPoint(null,  card, -0.5 * card.width, 0.0);
		}
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

function makeLoopCard(bed, from,to, loops, stackLoops) {
	console.assert(['f','fs','bs','b'].indexOf(bed) !== -1, "LoopCard must be on known bed");
	console.assert(['down', 'in', 'out'].indexOf(from) !== -1, "makeLoopCard wants reasonable from");
	console.assert(['in', 'out', 'up'].indexOf(to) !== -1, "makeLoopCard wants reasonable to");

	console.assert(Array.isArray(loops), "makeLoopCard must have [possibly empty] loops");

	var card = new Card();
	card.width = NEEDLE_WIDTH;
	card.height = NUDGE_WIDTH;
	card.top = card.height;
	card.bed = bed;

	card.from = from;
	card.to = to;

	var fromY, toY;
	if (from === 'down') {
		fromY = -0.5 * card.height;
	} else {
		fromY = 0.0;
	}
	if (to === 'up')  {
		toY = 0.5 * card.height;
	} else {
		toY = 0.0;
	}

	var outLoops = [];

	function addStackLoops() {
		if (stackLoops && stackLoops.length) {
			console.assert(card.to === 'up', "Only stack when to is 'up'.");

			stackLoops.forEach(function(loop){
				outLoops.push(loop.addPoints(card,[
					{x:-0.2 * card.width, y:-0.5 * card.height},
					{x:-0.2 * card.width, y:0.0},
					{x:-0.2 * card.width, y:toY}
				],[
					{x: 0.2 * card.width, y:-0.5 * card.height},
					{x: 0.2 * card.width, y:0.0},
					{x: 0.2 * card.width, y:toY}
				]));
			});
		}
	}

	if (card.bed === 'b' || card.bed === 'bs') addStackLoops();

	loops.forEach(function(loop){
		outLoops.push(loop.addPoints(card,[
			{x:-0.2 * card.width, y:fromY},
			{x:-0.2 * card.width, y:0.0},
			{x:-0.2 * card.width, y:toY}
		],[
			{x: 0.2 * card.width, y:fromY},
			{x: 0.2 * card.width, y:0.0},
			{x: 0.2 * card.width, y:toY}
		]));
	});

	if (card.bed === 'f' || card.bed === 'fs') addStackLoops();

	if (to === 'up') {
		card.outLoops = outLoops;
	} else {
		card.outLoops = [];
		card.xferLoops = outLoops;
	}

	card.draw = function(ctx, x) {
		ctx.beginPath();

		[-0.2, 0.2].forEach(function(ofs){
			if (this.from === 'down') {
				ctx.moveTo(x - ofs * this.width, this.top - this.height);
			} else if (this.from === 'in' || this.from === 'out') {
				ctx.moveTo(x - ofs * this.width, this.top - 0.5 * this.height);
			}
			ctx.lineTo(x - ofs * this.width, this.top - 0.5 * this.height);
			if (this.to === 'up') {
				ctx.lineTo(x - ofs * this.width, this.top);
			} else if (this.to === 'in' || this.to === 'out') {
				ctx.lineTo(x - ofs * this.width, this.top - 0.5 * this.height);
			}
		}, this);

		ctx.strokeStyle = '#0ff';
		ctx.stroke();
	};


	return card;
}



function RecordMachine() {
	//layers for each bed and -- eventually -- carrier:
	this.layers = { "b":[], "bs":[], "fs":[], "f":[] };

	//links between front and back beds:
	this.links = [];

	//name -> carriers map starts empty:
	this.carriers = {};

	//beds start aligned:
	this.racking = 0.0;
	//stitch values start zeroed:
	this.stitchValues = [0.0, 0.0];

	//yarns tracks all yarns that have been brought in:
	this.yarns = [];

	this.yarnColors = [
		"#ff0000",
		"#ffff00",
		"#00ff00",
		"#00ffff",
		"#0000ff",
		"#ff00ff"
	];
}

//'n' is a needle index, d is an optional nudge.
RecordMachine.prototype.getSlot = function(layerName, idx, d) {
	console.assert(layerName in this.layers, "getSlot should be called on layers that exist.");
	var layer = this.layers[layerName];

	var slotName;
	if (typeof(d) === 'undefined' || d === '') {
		slotName = idx;
	} else {
		if (d === '+') {
			slotName = idx + "+";
		} else if (d === '-') {
			slotName = idx + "-";
		} else {
			console.assert(false, "d should be '+','-','' or undefined");
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

//helper that adds a link between a given frontIndex and backIndex and makes sure it clears any link that it crosses by at least NUDGE_WIDTH:
RecordMachine.prototype.addLink = function(link) {
	if (!('yarnY' in link)) link.yarnY = 0.0;
	link.yarnY = 0.0;
	this.links.forEach(function(l){
		if (l.backIndex < link.backIndex && l.frontIndex < link.frontIndex) return;
		if (l.backIndex > link.backIndex && l.frontIndex > link.frontIndex) return;
		link.yarnY = Math.max(link.yarnY, l.yarnY + NUDGE_WIDTH);
	});
	this.links.push(link);
	return link.yarnY;
};


//helper that simultaneously adds many cards to stacks, all at the same (minimum) y-coordinate:
RecordMachine.prototype.stackCards = function(cards, flex, minYarnY) {
	//Figure out y-coordinate and add cards to stacks:
	var yarnY = (typeof(minYarnY) === 'undefined' ? 0.0 : minYarnY);
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
		if ('flex' in flex) flex.flex();
	}

	cards = [];
	flex = null;

	return yarnY;
};

//Helpers for iterating slots + nudges:
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

//move carriers in cs so that they line up properly to form a stitch in direction 'd' on needle 'n':
// will add cards as needed
// return value has {cards:, flex:} giving the cards to add to stacks and card to flex when adjusting yarn height.
RecordMachine.prototype.moveCarriers = function(d, n, cs) {
	var bsi = parseNeedle(n);

	var cards = []; //cards and the stacks to add them on -- used to compute yarnY.
	var flex = null; //card to adjust height of to match yarnY. (it's always a nudge-stack card)

	//Build yarn cards over to proper needle:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		if (!('lastCard' in c)) {
			//bringing in a yarn:
			c.yarn = new Yarn(this.yarnColors[0]);
			this.yarnColors.push(this.yarnColors.shift());
			this.yarns.push(c.yarn);
			var card = makeYarnNudgeCard('*', (d === '+' ? 'right' : 'left'), [c.yarn]);
			var slot = this.getSlot(bsi.bed, bsi.index, (d === '+' ? '-' : '+'));
			cards.push([card, slot]);
			return;
		}

		//need to create cards from c.lastSlot to starting slot.
		var s = {index:c.lastSlot.index, nudge:c.lastSlot.nudge};
		var t = {index: bsi.index, nudge:(d === '+' ? '-' : '+')};

	
		//Rather that being general to start with, I'll try to handle some well-defined cases:
		//NOTE: I'm assuming that c.lastCard is already at the top of its stack
		if (c.lastSlot.bed !== bsi.bed) {
			//create cards to move from the old bed to the new bed.
			var beds = ['b', 'bs', 'fs', 'f'];
			var si = beds.indexOf(c.lastSlot.bed);
			var ti = beds.indexOf(bsi.bed);
			var link = null;
			if (c.lastSlot.bed[0] !== bsi.bed[0]) {
				console.assert((si < 1.5) !== (ti < 1.5), "different bed letters => crossing bed gap");
				//crossing bed gap => need to add link
				link = {
					backIndex:slotToIndex(c.lastSlot),
					frontIndex:slotToIndex(c.lastSlot)
				};
			} else {
				console.assert((si < 1.5) === (ti < 1.5), "same bed letters => not crossing bed gap");
			}
			if (si < ti) {
				c.lastCard.setTo('out');
				flex = c.lastCard;
				for (var i = si + 1; i <= ti; ++i) {
					c.lastSlot.bed = beds[i];
					var slot = this.getSlot(c.lastSlot.bed, c.lastSlot.index, c.lastSlot.nudge);
					c.lastCard = makeYarnNudgeCard('in', (i == ti ? '*' : 'out'), [c.yarn], '#f0f');
					cards.push([ c.lastCard, slot ]);
				}
			} else { console.assert(si > ti, "last bed != bed, of course");
				c.lastCard.setTo('in');
				flex = c.lastCard;
				for (var i = si - 1; i >= ti; --i) {
					c.lastSlot.bed = beds[i];
					var slot = this.getSlot(c.lastSlot.bed, c.lastSlot.index, c.lastSlot.nudge);
					c.lastCard = makeYarnNudgeCard('out', (i == ti ? '*' : 'in'), [c.yarn], '#0f0');
					cards.push([ c.lastCard, slot ]);
				}
			}
			if (link) {
				this.addLink(link);
				link.yarnY = this.stackCards(cards,flex, link.yarnY);
			} else {
				this.stackCards(cards,flex);
			}
			cards = []; flex = null;
		}
		if (c.lastSlot.bed === bsi.bed) {
			var si = slotToIndex(s);
			var ti = slotToIndex(t);
			if (si < ti) {
				c.lastCard.setTo('right');
				flex = c.lastCard;

				for (var idx = si + 1; idx <= ti; ++idx) {
					var slot = indexToSlot(idx);
					if (slot.nudge === '') {
						var slot = this.getSlot(bsi.bed, slot.index);
						cards.push([
							makeMissCard('+', bsi.bed, [c.yarn], (slot.length == 0 ? [] : slot[slot.length-1].outLoops) ),
							slot
						]);
					} else {
						//NOTE: this may capture a yarn!
						cards.push([
							c.lastCard = makeYarnNudgeCard('left', 'right', [c.yarn]),
							this.getSlot(bsi.bed, slot.index, slot.nudge)
						]);
					}
				}
			} else if (si > ti) {
				c.lastCard.setTo('left');
				flex = c.lastCard;

				for (var idx = si - 1; idx >= ti; --idx) {
					var slot = indexToSlot(idx);
					if (slot.nudge === '') {
						var slot = this.getSlot(bsi.bed, slot.index);
						cards.push([
							makeMissCard('-', bsi.bed, [c.yarn], (slot.length == 0 ? [] : slot[slot.length-1].outLoops)),
							slot
						]);
					} else {
						//NOTE: this may capture a yarn!
						cards.push([
							c.lastCard = makeYarnNudgeCard('right', 'left', [c.yarn]),
							this.getSlot(bsi.bed, slot.index, slot.nudge)
						]);
					}
				}
			}

			//handle U-turn:
			//(note: could probably detect and avoid stackCards when lastCard is 'from' the opposite of d)
			this.stackCards(cards,flex); cards = []; flex = null;

			c.lastCard.setTo(d === '+' ? 'right' : 'left');
			flex = c.lastCard;
		}
	}, this);
	return {cards:cards, flex:flex};
};

RecordMachine.prototype.knit = function(d, n, cs) {
	var bsi = parseNeedle(n);
	if (bsi.slider) throw "Can't knit on a slider.";

	//Set up carriers:
	var ret = this.moveCarriers(d, n, cs);
	var cards = ret.cards;
	var flex = ret.flex;

	//gather list of yarns for makeKnitCard:
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
		var card = makeKnitCard(d, bsi.bed, yarns, loops);
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
	this.stackCards(cards,flex); cards = []; flex = null;

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
	if (bsi.slider) throw "Can't tuck on a slider.";

	//Set up carriers:
	var ret = this.moveCarriers(d, n, cs);
	var cards = ret.cards;
	var flex = ret.flex;

	//gather list of yarns for makeKnitCard:
	var yarns = [];
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		yarns.push(c.yarn);
	}, this);
	
	//Build a tuck card on the proper needle:
	(function(){
		var stack = this.getSlot(bsi.bed, bsi.index);
		var loops = [];
		if (stack.length !== 0) {
			loops = stack[stack.length-1].outLoops;
		}
		var card = makeTuckCard(d, bsi.bed, yarns, loops);
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
	this.stackCards(cards,flex); cards = []; flex = null;

};

RecordMachine.prototype.split = function(d, n, n2, cs) {
	var bsi = parseNeedle(n);
	var bsi2 = parseNeedle(n2);
	if (bsi.slider && cs.length) throw "Can't split from a slider.";
	if (bsi.slider && bsi2.slider) throw "Can't transfer slider-to-slider.";

	if (cs.length === 0) {
		//TODO: handle trapping yarn carriers against target bed.

		// "simple" xfer:
		var cards = [];
		var slot = this.getSlot(bsi.bed + (bsi.slider ? 's' : ''), bsi.index);
		var loops = (slot.length === 0 ? [] : slot[slot.length-1].outLoops);
		var card = makeLoopCard(bsi.bed + (bsi.slider ? 's' : ''), 'down', (bsi.bed === 'f' ? 'in' : 'out'), loops);
		cards.push([
			card,
			slot
		]);
		var slot2 = this.getSlot(bsi2.bed + (bsi2.slider ? 's' : ''), bsi2.index);
		var loops2 = (slot2.length === 0 ? [] : slot2[slot2.length-1].outLoops);
		cards.push([
			makeLoopCard(bsi2.bed + (bsi2.slider ? 's' : ''), (bsi2.bed === 'f' ? 'in' : 'out'), 'up', card.xferLoops, loops2),
			slot2
		]);

		var link = {};
		if (bsi.bed === 'b' || bsi.bed === 'bs') {
			console.assert(bsi2.bed === 'f' || bsi2.bed === 'fs', "xfer is back-to-front");
			link.backIndex = slotToIndex({index:bsi.index, nudge:""});
			link.frontIndex = slotToIndex({index:bsi2.index, nudge:""});
		} else {
			console.assert(bsi.bed === 'f' || bsi.bed === 'fs', "xfer is from valid bed");
			console.assert(bsi2.bed === 'b' || bsi2.bed === 'bs', "xfer is front-to-back");
			link.backIndex = slotToIndex({index:bsi2.index, nudge:""});
			link.frontIndex = slotToIndex({index:bsi.index, nudge:""});
		}
		this.addLink(link);
		link.yarnY = this.stackCards(cards, null, link.yarnY);
	} else {
		//must TODO!
	}

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
	canvas.width = 700;
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
	ctx.fillStyle = '#888';
	ctx.fillRect(0,0,canvas.width,canvas.height);

	var s = Math.min(
		canvas.width / (maxX - minX + NEEDLE_WIDTH),
		canvas.height / (maxY - minY + NEEDLE_WIDTH)
	);

	var px = 2.0 / s;

	ctx.lineWidth = px;
	ctx.setTransform( s,0, 0,-s, 0.5 * canvas.width - 0.5 * (maxX + minX) * s, 0.5 * canvas.height + 0.5 * (maxY + minY) * s );

/*
	//"old" drawing:
	// (rely on draw functions that don't actually know about yarn)
	["bs","b","fs","f"].forEach(function(layerName){
		var layer = this.layers[layerName];
		for (var slotName in layer) {
			var slot = layer[slotName];
			var x = slotX(slotName);
			var prev = null;
			slot.forEach(function(card){
				card.draw(ctx, x);

				if (prev && prev.outLoops && prev.outLoops.length) {
					//console.assert(card.loops && card.loops.length, "outLoops imply loops");
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
*/
	

	//"new" drawing:
	// assign x-coordinates to cards:
	["bs","b","fs","f"].forEach(function(layerName){
		var ofs = {
			"b":{x:-0.1, y:0.1},
			"bs":{x:-0.075, y:0.075},
			"fs":{x:-0.025, y:0.025},
			"f":{x:0.0, y:0.0}
		}[layerName];
		var tint = {
			"b":"#fff",
			"bs":"#bbf",
			"fs":"#88f",
			"f":""
		}[layerName];

		//ofs.x = 0.0; ofs.y = 0.0; //DEBUG, check alignment with old drawing

		var layer = this.layers[layerName];
		for (var slotName in layer) {
			var slot = layer[slotName];
			var x = slotX(slotName);
			slot.forEach(function(card){
				card.x = x + ofs.x;
				card.y = card.top - 0.5 * card.height + ofs.y;
				card.tint = tint;
			});
		}
	}, this);
	// sort yarn segments to cards:
	this.yarns.forEach(function(yarn){
		for (var pt = yarn.first; pt !== null; pt = pt.next) {
			if (pt.next !== null) { // && pt.next.card === pt.card) {
				ctx.beginPath();
				ctx.moveTo(pt.card.x + pt.x, pt.card.y + pt.y);
				ctx.lineTo(pt.next.card.x + pt.next.x, pt.next.card.y + pt.next.y);
				ctx.strokeStyle = (pt.card.tint !== "" ? pt.card.tint : yarn.color);
				ctx.stroke();
			}
		}
	});


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
