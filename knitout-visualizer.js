//protect rest of document from spurious variables:
/*DEBUG, don't: (function(){ */

//parseKnitout will parse knitout, catch syntax errors, and dispatch to calls on 'machine', an abstract knitting machine:
function parseKnitout(codeText, machine) {
	var errors = [];
	var warnings = [];

	var carrierNames = [];

	var inCommentHeader = true;
	
	codeText.split("\n").forEach(function(line, lineNumber) {
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
			} else if (op === "split") {
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
				console.log(e); //DEBUG
			}
		}

	});
}

//RecordMachine is an abstract knitting machine that records the loop structure of a knitout document:

const CARD_HEIGHT = 1.0; //height of cards
const CARD_GAP = 0.1; //minimum x/y space between cards
const CARD_SIDE_WIDTH = 1.0;
const CARD_CENTER_WIDTH = 2.2;


//Idea: the machine keeps track of a stack of "tiles" below each needle.
// Tiles are a stack of loop operation cards.
// Tiles may participate in more than one layer.
// Visualization is managed so that the volume of a tile is never overlapped by the volume of another tile.
// "Cards" in a tile have ten types of edges, though for a give tile type (side/needle) there are only six:
// left/right yarn connections
// in/out loop connections (needle tiles only)
// in/out yarn connections (side tiles only)
// up/down loop connections (needle tiles only)
// up/down yarn connections (side tiles only)

function Tile() {
	this.cards = []; //back-to-front
	//TODO: y-ordering constraints? this.constraints = []; // {other:Tile, over:bool}
}

//helpful directional tags for ports:
const PORT_LEFT  = 'l';
const PORT_RIGHT = 'r';
const PORT_UP    = 'u';
const PORT_DOWN  = 'd';
const PORT_IN    = 'i';
const PORT_OUT   = 'o';

function Card() {
	this.stackName = ''; //which stack is this card actually in? (Tiles can span multiple stacks.)
	this.yarns = []; //for drawing; have start:port, end:port;
	this.ports = []; //note: in left-to-right order for loop ports
}

function Port(type) {
	this.type = type;
	//this.card = card; //owner card, eventually?
	//this.yarn = ; //eventually, set also the yarn in the owner card?
	this.other = null; //connected port
}

function connectPorts(portA, portB) {
	con = portA.type + portB.type;
	console.assert(con === "lr" || con == "rl" || con == "ud" || con == "du" || con == "io" || con == "oi");
	//actual connection: TODO
}

//various types of cards:
function makeKnitFrontYarnCard() {
	//
	//  l---o  o---r
	//
	//the yarns part of a knit-front.
	var card = new Card();
	card.ports.push(new Port(PORT_LEFT));
	card.ports.push(new Port(PORT_OUT));
	card.ports.push(new Port(PORT_OUT));
	card.ports.push(new Port(PORT_RIGHT));

	card.yarns.push({
		start:card.ports[0],
		points:[{x:0.0, y:0.5}, {x:1.0/3.0+0.1, y:0.5-0.1}],
		end:card.ports[1]
	});

	card.yarns.push({
		start:card.ports[2],
		points:[{x:2.0/3.0-0.1, y:0.5-0.1}, {x:1.0, y:0.5}],
		end:card.ports[3]
	});

	return card;
}

function makeKnitFrontLoopCard() {
    //      u  u
	//      |  |
	//      i  i
	//
	//the loop part of a knit-front, comes from behind, leaves up
	var card = new Card();
	card.ports.push(new Port(PORT_IN));
	card.ports.push(new Port(PORT_UP));
	card.ports.push(new Port(PORT_UP));
	card.ports.push(new Port(PORT_IN));

	card.yarns.push({
		start:card.ports[0],
		points:[{x:1.0/3.0+0.1, y:0.5-0.1}, {x:1.0/3.0, y:1.0}],
		end:card.ports[1]
	});

	card.yarns.push({
		start:card.ports[2],
		points:[{x:2.0/3.0, y:1.0}, {x:2.0/3.0-0.1, y:0.5-0.1}],
		end:card.ports[3]
	});

	return card;
}


function makeLoopCard() {
	//
    //      .--.
	//      |  |
	//      d  d
	//a loop of yarn, comes from down.
	var card = new Card();
	card.ports.push(new Port(PORT_DOWN));
	card.ports.push(new Port(PORT_DOWN));

	card.yarns.push({
		start:card.ports[0],
		points:[{x:1.0/3.0, y:0.0}, {x:1.0/3.0, y:0.5}, {x:2.0/3.0, y:0.5}, {x:2.0/3.0, y:0.0}],
		end:card.ports[1]
	});

	return card;
}

//loop edges between cards are always clear from stack order
//yarn edges between cards are always to adjacent stacks(?) and might also be clear(??)

function RecordMachine() {
	//name -> carriers map starts empty:
	this.carriers = {};
	//bed starts empty:
	this.needles = {};
	//beds start aligned:
	this.racking = 0.0;
	//stitch values start zeroed:
	this.stitchValues = [0.0, 0.0];

	//knit object state tracked by tile stacks, which are referenced by layer + integer:
	this.stacks = {};
}

//there are stacks -/./+ of every needle on every layer:
RecordMachine.prototype.getStack = function(layer, index, side) {
	var key = layer + index + side;
	if (!(key in this.stacks)) {
		this.stacks[key] = [];
	}
	return this.stacks[key];
}

//set the carriers in front-to-back order; carriers start out of action at the right:
RecordMachine.prototype.setCarriers = function(cs) {
	this.carriers = {};
	cs.forEach(function(n){
		this.carriers[n] = {
			at:-Infinity
			// last: <-- if has knit
			// mark: <-- if marked to come in at next use
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

//helper to compute locs (front-bed-relative world positions) based on [direction +] needle :
RecordMachine.prototype.atLoc = function(n) {
	var m = n.match(/^([fb])(s?)([-+]?\d+)$/);
	console.assert(m !== null, "needle should always be parseable");
	var loc = parseInt(m[3]);
	if (m[1] === "b") {
		loc -= this.racking;
	}
	return loc;
};
RecordMachine.prototype.beforeLoc = function(d, n) {
	var loc = this.atLoc(n);
	if (d === '+') {
		loc -= 1.0 / 16.0;
	} else { console.assert(d === '-', "directions should only be +/-");
		loc += 1.0 / 16.0;
	}
	return ;
};
RecordMachine.prototype.afterLoc = function(d, n) {
	var loc = this.atLoc(n);
	if (d === '+') {
		loc += 1.0 / 16.0;
	} else { console.assert(d === '-', "directions should only be +/-");
		loc -= 1.0 / 16.0;
	}
	return ;
};


RecordMachine.prototype.markIn = function(cs, hook) {
	//check parameters:
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (c.last) throw "Carrier [" + cn + "] is already in action.";
		if (c.hook) throw "Carrier [" + cn + "] is already in a holding hook.";
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
		if (!c.last) needIn = true;
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
	var at = this.beforeLoc(d, n);

	//move carriers, remove mark:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		c.at = at;
		delete c.mark;
	}, this);

	//create a new holding hook, if needed:
	if (mark.hook) {
		var hook = {
			at:at,
			cs:cs.slice()
		};
		cs.forEach(function(n){
			this.carriers[n].hook = hook;
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
		c.at = -Infinity;
		delete c.last;
	}, this);
};

RecordMachine.prototype.in = function(cs) { this.markIn(cs, false); };
RecordMachine.prototype.inhook = function(cs) { this.markIn(cs, true); };

RecordMachine.prototype.releasehook = function(cs) {
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
};
RecordMachine.prototype.out = function(cs) { this.bringOut(cs, false); }
RecordMachine.prototype.outhook = function(cs) { this.bringOut(cs, true); }

RecordMachine.prototype.stitch = function(l, t) {
	this.stitchValues = {l:l, t:t};
};
RecordMachine.prototype.rack = function(r) {
	this.racking = r;
};
RecordMachine.prototype.knit = function(d, n, cs) {
	var bsi = parseNeedle(n);
	if (bsi.slider) throw "Can't knit on a slider.";

	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//TODO: kick other carriers
	//TODO: move carriers (might make yarn overlaps?)

	cs.forEach(function(cn){
		var c = this.carriers[cn];
		c.last = n + d; //TODO: should probably be a reference to a tile, card, or port.
	}, this);

	//build card stack for knit:
	var cards = []; //back-to-front

	cs.forEach(function(cn){
		var card = (bsi.bed === 'f' ? makeKnitFrontYarnCard() : makeKnitBackLoopCard());
		//TODO: connect ports
		cards.push(card);
	}, this);

	//core of stack is loops from previous 
	var stack = this.getStack(bsi.bed, bsi.index, '.');
	if (stack.length) {
		stack[stack.length-1].cards.forEach(function(card){
			var ups = [];
			card.ports.forEach(function(port){
				if (port.type === PORT_UP) {
					ups.push(port);
				}
			});
			console.assert(ups.length === 0 || ups.length === 2, "up ports are always loops");
			if (ups.length === 2) {
				var loopCard = makeLoopCard();
				connectPorts(ups[0], loopCard.ports[0]);
				connectPorts(ups[1], loopCard.ports[1]);
				cards.push(loopCard);
			}
		}, this);
	}
	cs.forEach(function(cn){
		var card = (bsi.bed === 'f' ? makeKnitFrontLoopCard() : makeKnitBackYarnCard());
		//TODO: connect ports
		cards.push(card);
	}, this);

	//put on proper layer:
	cards.forEach(function(card){
		card.stack = bsi.bed + bsi.index + '.';
	});

	//if there are some cards, push tile onto stack:
	if (cards.length) {
		var tile = new Tile();
		tile.cards = cards;
		stack.push(tile);
	}

/*
	var bsi = parseNeedle(n);

	//record stitch:
	var stitch = {
		type:'k',
		created:needle, //or figuring out the direction it is through 'through'
		loopsIn:null, //what loops is it through? (needle order)
	};
	if (n in this.needles) {
		stitch.through = this.needles[n];
	}
	this.needles[n] = stitch;
	*/

};
RecordMachine.prototype.tuck = function(d, n, cs) {
};
RecordMachine.prototype.split = function(d, n, n2, cs) {
};
RecordMachine.prototype.miss = function(d, n, cs) {
};
RecordMachine.prototype.pause = function() {
};


//create an SVG from stacks:
RecordMachine.prototype.drawStacks = function() {
	var svgNS = 'http://www.w3.org/2000/svg';
	var svg = document.createElementNS(svgNS, 'svg');
	window.svg = svg; //DEBUG

	//figure out which tiles are below other tiles:
	var yOrder = [];
	var tiles = [];
	var mark = {};

	function parseStackName(sn) {
		var m = sn.match(/^([fb][s]?|c-\(.*\))([-+]?\d+)([-+.])$/);
		console.assert(m !== null, "can't parse stack name [" + sn + "]");
		return {
			layer:m[1],
			index:parseInt(m[2]),
			shift:m[3]
		};
	}

	for (var sn in this.stacks) {
		var stack = this.stacks[sn];
		stack.forEach(function(tile, i){
			//tiles might be in more than one stack. Make sure to add to tiles array just once, though.
			if (tile.mark !== mark) {
				tiles.push(tile);
				tile.mark = mark;
			}
			if (i > 0) {
				yOrder.push({above:tile, below:stack[i-1]});
			}
		});
	}

	console.log("Have " + tiles.length + " tiles.");

	//topological sort based on above/below order:
	tiles.forEach(function(tile) {
		tile.below = 0;
		tile.above = [];
		tile.y = 0.0; //eventually, will determine y-coordinate by being below everything
	});

	yOrder.forEach(function(ab){
		ab.below.below += 1;
		ab.above.above.push(ab.below);
	});

	var ready = [];
	tiles.forEach(function(tile) {
		if (tile.below === 0) {
			ready.push(tile);
			tile.y = 0.0;
		}
	});

	var fullWidth = CARD_CENTER_WIDTH + 2.0 * CARD_SIDE_WIDTH + 3.0 * CARD_GAP;

	for (var i = 0; i < ready.length; ++i) {
		var tile = ready[i];
		console.assert(tile.below === 0, "tile should be ready");
		tile.above.forEach(function(a){
			a.y = Math.min(a.y, tile.y - CARD_HEIGHT - CARD_GAP);
			console.assert(a.below > 0, "tile should not be ready");
			a.below -= 1;
			if (a.below === 0) ready.push(a);
		});
	}

	var cards = [];

	tiles.forEach(function(tile) {
		console.assert(tile.below === 0, "tile was done");
		tile.cards.forEach(function(card){
			var lis = parseStackName(card.stack);
			card.w = (lis.shift === '.' ? CARD_CENTER_WIDTH : CARD_SIDE_WIDTH);
			card.h = CARD_HEIGHT;
			card.y = tile.y;
			card.x = lis.index * fullWidth;
			cards.push(card);
		});
	});


	var min = {x:Infinity, y:-0.5};
	var max = {x:-Infinity, y:0.5};

	cards.forEach(function(card){
		min.x = Math.min(min.x, card.x - 0.5 * card.w);
		min.y = Math.min(min.y, card.y - 0.5 * card.h);
		max.x = Math.max(max.x, card.x + 0.5 * card.w);
		max.y = Math.max(max.y, card.y + 0.5 * card.h);
	});

	console.log("Have " + cards.length + " cards, in the [" + min.x + ", " + max.x + "]x[" + min.y + "," + max.y + "] range.");

	var width = 1.0;
	if (min.x < max.x) {
		width = max.x - min.x + 1.0;
	}
	var height = 1.0;
	if (min.y < max.y) {
		height = max.y - min.y + 1.0;
	}
	svg.setAttribute("width", Math.ceil(width * 30) + "px");
	svg.setAttribute("height", Math.ceil(height * 30) + "px");

	svg.setAttribute("viewBox", "0 0 " + width + " " + height);
	svg.setAttribute("style", "background:#eee");

	var path = document.createElementNS(svgNS, 'path');
	path.setAttribute("style", "stroke-width:0.05;stroke:#000;fill:none;");
	var d = "";
	cards.forEach(function(card){
		card.yarns.forEach(function(yarn){
			yarn.points.forEach(function(p, i){
				if (i === 0) {
					d += "M";
				}
				var x = (card.w * (p.x - 0.5) + card.x) - min.x + 0.5;
				var y = height - (card.h * (p.y - 0.5) + card.y - min.y) - 0.5;
				d += " " + x.toFixed(2) + "," + y.toFixed(2);
			});
		});
	});
	path.setAttribute("d", d);
	svg.appendChild(path);

	return svg;
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
