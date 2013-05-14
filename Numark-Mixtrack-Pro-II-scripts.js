// Based on Numark Mixtrack Mapping Script Functions
// 1/11/2010 - v0.1 - Matteo <matteo@magm3.com>
//
// 5/18/2011 - Changed by James Ralston
// 5/14/2013 - Adapted to Mix Track Pro II by Mathis Antony <sveitser@gmail.com>
//  
// Known Bugs:
//	Mixxx complains about an undefined variable on 1st load of the mapping (ignore it, then restart Mixxx)
//	Each slide/knob needs to be moved on Mixxx startup to match levels with the Mixxx UI
//
// 05/26/2012 to 06/27/2012 - Changed by Darío José Freije <dario2004@gmail.com>
//
//	Almost all work like expected. Resume and Particularities:
//
// ************* Script now is Only for 1.11.0 and above *************
//
//	Delete + Effect: Brake Effect (maintain pressed).
//			 Flanger Delay (2nd knob of effect section): Adjust the speed of Brake.
//
//	Delete + Hotcues: Clear Hotcues (First press Delete, then Hotcue).
//	Delete + Reloop:  Clear Loop.
//	Delete + Manual:  Set Quantize ON (for best manual loop) or OFF.
//	Delete + Sync: 	  Set Pitch to Zero.
//
// 	Load track: 	Only if the track is paused. Put the pitch in 0 at load.
//
//	Keylock: disabled on wheel touch when in scratch mode (make noise anyway at exit scratch).
//
//  	Gain: 	The 3rd knob of the "effect" section is "Gain" (up to clip).
//
//	Effect:	Flanger. 1st and 2nd knob modify Depth and Delay.
//
//	Cue: 	Don't set Cue accidentaly at the end of the song (return to the lastest cue).
//		LED ON when stopped. LED OFF when playing.
//		LED Blink at Beat time in the ultimates 30 seconds of song.
//
// 	Stutter: Adjust BeatGrid in the correct place (usefull to sync well).
//		 LED Blink at each Beat of the grid.
//
//	Sync:	If the other deck is stopped, only sync tempo (not fase).
//		LED Blink at Clip Gain (Peak indicator).
//
// 	Pitch: 	Up, Up; Down, Down. Pitch slide are inverted, to match with the screen (otherwise is very confusing).
//		Soft-takeover to prevent sudden wide parameter changes when the on-screen control diverges from a hardware control.
//		The control will have no effect until the position is close to that of the software, 
//		at which point it will take over and operate as usual.
//
// 	Auto Loop (LED ON): 	Active at program Start.
//				"1 Bar" button: Active an Instant 4 beat Loop. Press again to exit loop.
//
//	Scratch: 
//	In Stop mode, with Scratch OFF or ON: 	Scratch at touch, and Stop moving when the wheel stop moving.
//	In Play mode, with Scratch OFF: 	Only Pitch bend.
// 	In Play mode, with Scratch ON: 		Scratch at touch and, in Backwards Stop Scratch when the wheel stop moving for 20ms -> BACKSPIN EFFECT!!!!.
//						In Fordward Stop Scratch when the touch is released > Play Inmediatly (without breaks for well mix).
//						Border of the wheels: Pitch Bend.
//


function NumarkMTPII() {}

NumarkMTPII.init = function(id) {	// called when the MIDI device is opened & set up
	NumarkMTPII.id = id;	// Store the ID of this device for later use
	
	NumarkMTPII.directoryMode = false;
	NumarkMTPII.scratchMode = [false, false];
	NumarkMTPII.manualLoop = [true, true];
	NumarkMTPII.deleteKey = [false, false];
	NumarkMTPII.isKeyLocked = [0, 0];
	NumarkMTPII.touch = [false, false];
	NumarkMTPII.scratchTimer = [-1, -1];

	NumarkMTPII.leds = [
		// Common
		{ "directory": 0x73, "file": 0x72 },
		// Deck 1
		{ "rate": 0x70, "scratchMode": 0x48, "manualLoop": 0x61, 
		"loop_start_position": 0x53, "loop_end_position": 0x54, "reloop_exit": 0x55,
		"deleteKey" : 0x59, "hotCue1" : 0x5a,"hotCue2" : 0x5b,"hotCue3" :  0x5c,
		"stutter" : 0x4a, "Cue" : 0x33, "sync" : 0x40 
		},
		// Deck 2
		{ "rate": 0x71, "scratchMode": 0x50, "manualLoop": 0x62, 
		"loop_start_position": 0x56, "loop_end_position": 0x57, "reloop_exit": 0x58,
		"deleteKey" : 0x5d, "hotCue1" : 0x5e, "hotCue2" : 0x5f, "hotCue3" :  0x60,
		"stutter" : 0x4c, "Cue" : 0x3c, "sync" : 0x47 
		 }
	];
	
	NumarkMTPII.ledTimers = {};

	NumarkMTPII.LedTimer = function(id, led, count, state){
		this.id = id;
		this.led = led;
		this.count = count;
		this.state = state;
	}

	for (i=0x30; i<=0x73; i++) midi.sendShortMsg(0x90, i, 0x00); 	// Turn off all the lights

	NumarkMTPII.hotCue = {
			//Deck 1 
			0x5a:"1", 0x5b:"2", 0x5c:"3",
			//Deck 2
			0x5e: "1", 0x5f:"2", 0x60:"3"
			};

	//Add event listeners
	for (var i=1; i<3; i++){
		for (var x=1; x<4; x++){
			engine.connectControl("[Channel" + i +"]", "hotcue_"+ x +"_enabled", "NumarkMTPII.onHotCueChange");
		}
		NumarkMTPII.setLoopMode(i, false);
	}

	NumarkMTPII.setLED(NumarkMTPII.leds[0]["file"], true);


// Enable soft-takeover for Pitch slider

	engine.softTakeover("[Channel1]", "rate", true);
	engine.softTakeover("[Channel2]", "rate", true);


// Clipping LED
	engine.connectControl("[Channel1]","PeakIndicator","NumarkMTPII.Channel1Clip");
	engine.connectControl("[Channel2]","PeakIndicator","NumarkMTPII.Channel2Clip");

// Stutter beat light
	engine.connectControl("[Channel1]","beat_active","NumarkMTPII.Stutter1Beat");
	engine.connectControl("[Channel2]","beat_active","NumarkMTPII.Stutter2Beat");


}


NumarkMTPII.Channel1Clip = function (value) {
	NumarkMTPII.clipLED(value,NumarkMTPII.leds[1]["sync"]);

}

NumarkMTPII.Channel2Clip = function (value) {
	NumarkMTPII.clipLED(value,NumarkMTPII.leds[2]["sync"]);

}

NumarkMTPII.Stutter1Beat = function (value) {

	var secondsBlink = 30;
    	var secondsToEnd = engine.getValue("[Channel1]", "duration") * (1-engine.getValue("[Channel1]", "playposition"));
	
	if (secondsToEnd < secondsBlink && secondsToEnd > 1 && engine.getValue("[Channel1]", "play")) { // The song is going to end

		NumarkMTPII.setLED(NumarkMTPII.leds[1]["Cue"], value);
	}
	NumarkMTPII.setLED(NumarkMTPII.leds[1]["stutter"], value);

}

NumarkMTPII.Stutter2Beat = function (value) {

	var secondsBlink = 30;
    	var secondsToEnd = engine.getValue("[Channel2]", "duration") * (1-engine.getValue("[Channel2]", "playposition"));
	
	if (secondsToEnd < secondsBlink && secondsToEnd > 1 && engine.getValue("[Channel2]", "play")) { // The song is going to end

		NumarkMTPII.setLED(NumarkMTPII.leds[2]["Cue"], value);
	}	

	NumarkMTPII.setLED(NumarkMTPII.leds[2]["stutter"], value);

}

NumarkMTPII.clipLED = function (value, note) {

	if (value>0) NumarkMTPII.flashLED(note, 1); 

}

NumarkMTPII.shutdown = function(id) {	// called when the MIDI device is closed

	// First Remove event listeners
	for (var i=1; i<2; i++){
		for (var x=1; x<4; x++){
			engine.connectControl("[Channel" + i +"]", "hotcue_"+ x +"_enabled", "NumarkMTPII.onHotCueChange", true);
		}	
		NumarkMTPII.setLoopMode(i, false);
	}

	var lowestLED = 0x30;
	var highestLED = 0x73;
	for (var i=lowestLED; i<=highestLED; i++) {
		NumarkMTPII.setLED(i, false);	// Turn off all the lights
	}

}

NumarkMTPII.samplesPerBeat = function(group) {
	// FIXME: Get correct samplerate and channels for current deck
	var sampleRate = 44100;
	var channels = 2;
	var bpm = engine.getValue(group, "file_bpm");
	return channels * sampleRate * 60 / bpm;
}

NumarkMTPII.groupToDeck = function(group) {

	var matches = group.match(/^\[Channel(\d+)\]$/);

	if (matches == null) {
		return -1;
	} else {
		return matches[1];
	}

}

NumarkMTPII.setLED = function(value, status) {

	status = status ? 0x64 : 0x00;
	midi.sendShortMsg(0x90, value, status);
}

NumarkMTPII.flashLED = function (led, veces){	
	var ndx = Math.random();
	var func = "NumarkMTPII.doFlash(" + ndx + ", " + veces + ")";
	var id = engine.beginTimer(120, func);
	NumarkMTPII.ledTimers[ndx] =  new NumarkMTPII.LedTimer(id, led, 0, false);
}

NumarkMTPII.doFlash = function(ndx, veces){
	var ledTimer = NumarkMTPII.ledTimers[ndx];
	
	if (!ledTimer) return;
	
	if (ledTimer.count > veces){ // how many times blink the button
		engine.stopTimer(ledTimer.id);
		delete NumarkMTPII.ledTimers[ndx];
	} else{
		ledTimer.count++;
		ledTimer.state = !ledTimer.state;
		NumarkMTPII.setLED(ledTimer.led, ledTimer.state);
	}
}

NumarkMTPII.selectKnob = function(channel, control, value, status, group) {
	if (value > 63) {
		value = value - 128;
	}
	if (NumarkMTPII.directoryMode) {
		if (value > 0) {
			for (var i = 0; i < value; i++) {
				engine.setValue(group, "SelectNextPlaylist", 1);
			}
		} else {
			for (var i = 0; i < -value; i++) {
				engine.setValue(group, "SelectPrevPlaylist", 1);
			}
		}
	} else {
		engine.setValue(group, "SelectTrackKnob", value);

	}
}

NumarkMTPII.LoadTrack = function(channel, control, value, status, group) {

	// Load the selected track in the corresponding deck only if the track is paused

	if(value && engine.getValue(group, "play") != 1) 
	{
		engine.setValue(group, "LoadSelectedTrack", 1);

		// cargar el tema con el pitch en 0
		engine.softTakeover(group, "rate", false);
		engine.setValue(group, "rate", 0);
		engine.softTakeover(group, "rate", true);
	}
	else engine.setValue(group, "LoadSelectedTrack", 0);

}

NumarkMTPII.flanger = function(channel, control, value, status, group) {

// 	if (!value) return;

	var deck = NumarkMTPII.groupToDeck(group);
	
	var speed = 1;

	if(NumarkMTPII.deleteKey[deck-1]){

	// Delete + Effect = Brake

//	print ("Delay: " + engine.getValue("[Flanger]","lfoDelay"));

		if (engine.getValue("[Flanger]","lfoDelay") < 5026) {

			speed = engine.getValue("[Flanger]","lfoDelay") / 5025;

			if (speed < 0) speed = 0;

		} else {

			speed = (engine.getValue("[Flanger]","lfoDelay") - 5009)/ 16,586666667

			if (speed > 300) speed = 300;
		}

//	print ("Speed: " + speed);

		engine.brake(deck, value, speed);

		if (!value) NumarkMTPII.toggleDeleteKey(channel, control, 1, status, group);

	} else {
		if (!value) return;
		if (engine.getValue(group, "flanger")) {
			engine.setValue(group, "flanger", 0);
		}else{
			engine.setValue(group, "flanger", 1);
		}
	}

}


NumarkMTPII.cuebutton = function(channel, control, value, status, group) {


	// Don't set Cue accidentaly at the end of the song
	if (engine.getValue(group, "playposition") <= 0.97) {
			engine.setValue(group, "cue_default", value ? 1 : 0);
	} else {
		engine.setValue(group, "cue_preview", value ? 1 : 0);
	}

}

NumarkMTPII.beatsync = function(channel, control, value, status, group) {

	var deck = NumarkMTPII.groupToDeck(group);

	if(NumarkMTPII.deleteKey[deck-1]){

		// Delete + SYNC = vuelve pitch a 0
		engine.softTakeover(group, "rate", false);
		engine.setValue(group, "rate", 0);
		engine.softTakeover(group, "rate", true);

		NumarkMTPII.toggleDeleteKey(channel, control, value, status, group);

	} else {

			if (deck == 1) {
				// si la otra deck esta en stop, sincronizo sólo el tempo (no el golpe)
				if(!engine.getValue("[Channel2]", "play")) {
					engine.setValue(group, "beatsync_tempo", value ? 1 : 0);
				} else {
						engine.setValue(group, "beatsync", value ? 1 : 0);
					}
			}

			if (deck == 2) {
				// si la otra deck esta en stop, sincronizo sólo el tempo (no el golpe)
				if(!engine.getValue("[Channel1]", "play")) {
					engine.setValue(group, "beatsync_tempo", value ? 1 : 0);
				} else {
						engine.setValue(group, "beatsync", value ? 1 : 0);
					}
			}
		}
}


NumarkMTPII.playbutton = function(channel, control, value, status, group) {

	if (!value) return;

	var deck = NumarkMTPII.groupToDeck(group);

	if (engine.getValue(group, "play")) {
		engine.setValue(group, "play", 0);
	}else{
		engine.setValue(group, "play", 1);
	}

}


NumarkMTPII.loopIn = function(channel, control, value, status, group) {
	var deck = NumarkMTPII.groupToDeck(group);
	
	if (NumarkMTPII.manualLoop[deck-1]){
		if (!value) return;
		// Act like the Mixxx UI
		engine.setValue(group, "loop_in", status?1:0);
		return;
	} 
	
	// Auto Loop: 1/2 loop size
	var start = engine.getValue(group, "loop_start_position");
	var end = engine.getValue(group, "loop_end_position");
	if (start<0 || end<0) {
		NumarkMTPII.flashLED(NumarkMTPII.leds[deck]["loop_start_position"], 4);
		return;
	}

	if (value){
		var start = engine.getValue(group, "loop_start_position");
		var end = engine.getValue(group, "loop_end_position");
		var len = (end - start) / 2;
		engine.setValue(group, "loop_end_position", start + len);
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["loop_start_position"], true);  
	} else {
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["loop_start_position"], false);
	}
}

NumarkMTPII.loopOut = function(channel, control, value, status, group) {
	var deck = NumarkMTPII.groupToDeck(group);
	
	if (!value) return;
	
	if (NumarkMTPII.manualLoop[deck-1]){
		// Act like the Mixxx UI
		engine.setValue(group, "loop_out", status?1:0);
		return;
	}

	var isLoopActive = engine.getValue(group, "loop_enabled");
		
	// Set a 4 beat auto loop or exit the loop

	if(!isLoopActive){
		engine.setValue(group,"beatloop_4",1);
	}else{
		engine.setValue(group,"beatloop_4",0);
	}

}

NumarkMTPII.repositionHack = function(group, oldPosition){
	// see if the value has been updated
	if (engine.getValue(group, "loop_start_position")==oldPosition){
		if (NumarkMTPII.hackCount[group]++ < 9){
			engine.beginTimer(20, "NumarkMTPII.repositionHack('" + group + "', " + oldPosition + ")", true);
		} else {			
			var deck = NumarkMTPII.groupToDeck(group);
			NumarkMTPII.flashLED(NumarkMTPII.leds[deck]["loop_start_position"], 4);
		}
		return;
	}
	var bar = NumarkMTPII.samplesPerBeat(group);
	var start = engine.getValue(group, "loop_start_position");
	engine.setValue(group,"loop_end_position", start + bar);
}

NumarkMTPII.reLoop = function(channel, control, value, status, group) {
	var deck = NumarkMTPII.groupToDeck(group);
	
	if (NumarkMTPII.manualLoop[deck-1]){
		// Act like the Mixxx UI (except for working delete)
		if (!value) return;
		if (NumarkMTPII.deleteKey[deck-1]){
			engine.setValue(group, "reloop_exit", 0);
			engine.setValue(group, "loop_start_position", -1);
			engine.setValue(group, "loop_end_position", -1);
			NumarkMTPII.toggleDeleteKey(channel, control, value, status, group);
		} else {
			engine.setValue(group, "reloop_exit", status?1:0);
		}
		return;
	}
	
	// Auto Loop: Double Loop Size
	var start = engine.getValue(group, "loop_start_position");
	var end = engine.getValue(group, "loop_end_position");
	if (start<0 || end<0) {
		NumarkMTPII.flashLED(NumarkMTPII.leds[deck]["reloop_exit"], 4);
		return;
	}

	if (value){
		var len = (end - start) * 2;
		engine.setValue(group, "loop_end_position", start + len);
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["reloop_exit"], true);
	} else {
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["reloop_exit"], false);
	}
}

NumarkMTPII.setLoopMode = function(deck, manual) {

	NumarkMTPII.manualLoop[deck-1] = manual;
	NumarkMTPII.setLED(NumarkMTPII.leds[deck]["manualLoop"], !manual);
	engine.connectControl("[Channel" + deck + "]", "loop_start_position", "NumarkMTPII.onLoopChange", !manual);
	engine.connectControl("[Channel" + deck + "]", "loop_end_position", "NumarkMTPII.onLoopChange", !manual);
	engine.connectControl("[Channel" + deck + "]", "loop_enabled", "NumarkMTPII.onReloopExitChange", !manual);
	engine.connectControl("[Channel" + deck + "]", "loop_enabled", "NumarkMTPII.onReloopExitChangeAuto", manual);
	
	var group = "[Channel" + deck + "]"
	if (manual){
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["loop_start_position"], engine.getValue(group, "loop_start_position")>-1);
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["loop_end_position"], engine.getValue(group, "loop_end_position")>-1);
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["reloop_exit"], engine.getValue(group, "loop_enabled"));
	}else{
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["loop_start_position"], false);
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["loop_end_position"], engine.getValue(group, "loop_enabled"));
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["reloop_exit"], false);		
	}
}

NumarkMTPII.toggleManualLooping = function(channel, control, value, status, group) {
	if (!value) return;
	
	var deck = NumarkMTPII.groupToDeck(group);

	if(NumarkMTPII.deleteKey[deck-1]){
		// activar o desactivar quantize

		if (engine.getValue(group, "quantize")) {
			engine.setValue(group, "quantize", 0);
		}else{
			engine.setValue(group, "quantize", 1);
		}

		NumarkMTPII.toggleDeleteKey(channel, control, value, status, group);
	} else {
	
		NumarkMTPII.setLoopMode(deck, !NumarkMTPII.manualLoop[deck-1]);
	}
}

NumarkMTPII.onLoopChange = function(value, group, key){
	var deck = NumarkMTPII.groupToDeck(group);
	NumarkMTPII.setLED(NumarkMTPII.leds[deck][key], value>-1? true : false);
}

NumarkMTPII.onReloopExitChange = function(value, group, key){
	var deck = NumarkMTPII.groupToDeck(group);
	NumarkMTPII.setLED(NumarkMTPII.leds[deck]['reloop_exit'], value);
}

NumarkMTPII.onReloopExitChangeAuto = function(value, group, key){
	var deck = NumarkMTPII.groupToDeck(group);
	NumarkMTPII.setLED(NumarkMTPII.leds[deck]['loop_end_position'], value);
}

// Stutters adjust BeatGrid
NumarkMTPII.playFromCue = function(channel, control, value, status, group) {

	var deck = NumarkMTPII.groupToDeck(group);

	if (engine.getValue(group, "beats_translate_curpos")){

		engine.setValue(group, "beats_translate_curpos", 0);
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["stutter"], 0);
	}else{
		engine.setValue(group, "beats_translate_curpos", 1);
		NumarkMTPII.setLED(NumarkMTPII.leds[deck]["stutter"], 1);
	}

}

NumarkMTPII.pitch = function(channel, control, value, status, group) {
	var deck = NumarkMTPII.groupToDeck(group);

	var pitch_value = 0;

	if (value < 64) pitch_value = (value-64) /64;
	if (value > 64) pitch_value = (value-64) /63;

	engine.setValue("[Channel"+deck+"]","rate",pitch_value);
}


NumarkMTPII.jogWheel = function(channel, control, value, status, group) {
	var deck = NumarkMTPII.groupToDeck(group);

// 	if (!NumarkMTPII.touch[deck-1] && !engine.getValue(group, "play")) return;

	var adjustedJog = parseFloat(value);
	var posNeg = 1;
	if (adjustedJog > 63) {	// Counter-clockwise
		posNeg = -1;
		adjustedJog = value - 128;
	}

	if (engine.getValue(group, "play")) {

		if (NumarkMTPII.scratchMode[deck-1] && posNeg == -1 && !NumarkMTPII.touch[deck-1]) {

			if (NumarkMTPII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMTPII.scratchTimer[deck-1]);
			NumarkMTPII.scratchTimer[deck-1] = engine.beginTimer(20, "NumarkMTPII.jogWheelStopScratch(" + deck + ")", true);
		} 

	} else { // en stop hace scratch siempre
	
		if (!NumarkMTPII.touch[deck-1]){

			if (NumarkMTPII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMTPII.scratchTimer[deck-1]);
			NumarkMTPII.scratchTimer[deck-1] = engine.beginTimer(20, "NumarkMTPII.jogWheelStopScratch(" + deck + ")", true);
		}

	}
    print("scratch tick")
    print(adjustedJog)
	engine.scratchTick(deck, adjustedJog);

	if (engine.getValue(group,"play")) {
		var gammaInputRange = 13;	// Max jog speed
		var maxOutFraction = 0.8;	// Where on the curve it should peak; 0.5 is half-way
		var sensitivity = 0.5;		// Adjustment gamma
		var gammaOutputRange = 2;	// Max rate change

		adjustedJog = posNeg * gammaOutputRange * Math.pow(Math.abs(adjustedJog) / (gammaInputRange * maxOutFraction), sensitivity);
		engine.setValue(group, "jog", adjustedJog);	
	}

}

//// The button that enables/disables scratching
//NumarkMTPII.wheelTouch = function (channel, control, value, status, group) {
//	var deck = NumarkMTPII.groupToDeck(group);
//    if ((status & 0xF0) == 0x90) {    // If button down
//  //if (value == 0x7F) {  // Some wheels send 0x90 on press and release, so you need to check the value
//        var alpha = 1.0/8;
//        var beta = alpha/32;
//        print("scr enab")
//        engine.scratchEnable(deck, 128, 33+1/3, alpha, beta);
//        // Keep track of whether we're scratching on this virtual deck - for v1.10.x or below
//        // NumarkMTPII.scratching[deck] = true;
//    }
//    else {    // If button up
//        engine.scratchDisable(deck);
//        //NumarkMTPII.scratching[deck] = false;  // Only for v1.10.x and below
//    }
//}
// 
//// The wheel that actually controls the scratching
//NumarkMTPII.wheelTurn = function (channel, control, value, status, group) {
//	var deck = NumarkMTPII.groupToDeck(group);
//    // See if we're scratching. If not, skip this.
//    if (!engine.isScratching(deck)) return; // for 1.11.0 and above
//    //if (!NumarkMTPII.scratching[deck]) return; // for 1.10.x and below
// 
//    // --- Choose only one of the following!
// 
//    // A: For a control that centers on 0:
//    var newValue;
//    if (value-64 > 0) newValue = value-128;
//    else newValue = value;
// 
//    // B: For a control that centers on 0x40 (64):
//    var newValue=(value-64);
// 
//    // --- End choice
// 
//    // In either case, register the movement
//    engine.scratchTick(deck,newValue);
//}

NumarkMTPII.jogWheelStopScratch = function(deck) {
    print("disable scratch")
	NumarkMTPII.scratchTimer[deck-1] = -1;
	engine.scratchDisable(deck);

		if (NumarkMTPII.isKeyLocked[deck-1] == 1) {
			// print ("restaurando keylock");
			// Restore the previous state of the Keylock
			engine.setValue("[Channel"+deck+"]", "keylock", NumarkMTPII.isKeyLocked[deck-1]);
			NumarkMTPII.isKeyLocked[deck-1] = 0;
		}
		
}

NumarkMTPII.wheelTouch = function(channel, control, value, status, group){

	var deck = NumarkMTPII.groupToDeck(group);
	
    if(!value){

		NumarkMTPII.touch[deck-1]= false;

// 	paro el timer (si no existe da error mmmm) y arranco un nuevo timer. 
// 	Si en 20 milisegundos no se mueve el plato, desactiva el scratch

		if (NumarkMTPII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMTPII.scratchTimer[deck-1]);

		NumarkMTPII.scratchTimer[deck-1] = engine.beginTimer(20, "NumarkMTPII.jogWheelStopScratch(" + deck + ")", true);

	} else {

		// si esta en play y el modo scratch desactivado, al presionar el touch no hace nada
		if (!NumarkMTPII.scratchMode[deck-1] && engine.getValue(group, "play")) return;

		// Save the current state of the keylock
		NumarkMTPII.isKeyLocked[deck-1] = engine.getValue(group, "keylock");
		// Turn the Keylock off for scratching
		if (NumarkMTPII.isKeyLocked[deck-1]){
			engine.setValue(group, "keylock", 0);
		}


		if (NumarkMTPII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMTPII.scratchTimer[deck-1]);

        print("enabling scratch")
		// change the 600 value for sensibility
		engine.scratchEnable(deck, 600, 33+1/3, 1.0/8, (1.0/8)/32);
        //engine.scratchEnable(deck, 128, 33+1/3, 1.0/8, (1.0/8)/32);

		NumarkMTPII.touch[deck-1]= true;
	}
}

NumarkMTPII.toggleDirectoryMode = function(channel, control, value, status, group) {
	// Toggle setting and light
	if (value) {
		NumarkMTPII.directoryMode = !NumarkMTPII.directoryMode;

		NumarkMTPII.setLED(NumarkMTPII.leds[0]["directory"], NumarkMTPII.directoryMode);
		NumarkMTPII.setLED(NumarkMTPII.leds[0]["file"], !NumarkMTPII.directoryMode);
	}
}

NumarkMTPII.toggleScratchMode = function(channel, control, value, status, group) {
	if (!value) return;
	
	var deck = NumarkMTPII.groupToDeck(group);
	// Toggle setting and light
	NumarkMTPII.scratchMode[deck-1] = !NumarkMTPII.scratchMode[deck-1];
	NumarkMTPII.setLED(NumarkMTPII.leds[deck]["scratchMode"], NumarkMTPII.scratchMode[deck-1]);
}


NumarkMTPII.onHotCueChange = function(value, group, key){
	var deck = NumarkMTPII.groupToDeck(group);
	var hotCueNum = key[7];
	NumarkMTPII.setLED(NumarkMTPII.leds[deck]["hotCue" + hotCueNum], value ? true : false);
}

NumarkMTPII.changeHotCue = function(channel, control, value, status, group){

	var deck = NumarkMTPII.groupToDeck(group);
	var hotCue = NumarkMTPII.hotCue[control];

	// onHotCueChange called automatically
	if(NumarkMTPII.deleteKey[deck-1]){
		if (engine.getValue(group, "hotcue_" + hotCue + "_enabled")){
			engine.setValue(group, "hotcue_" + hotCue + "_clear", 1);
		}
		NumarkMTPII.toggleDeleteKey(channel, control, value, status, group);
	} else {
		if (value) {
			engine.setValue(group, "hotcue_" + hotCue + "_activate", 1);
			
		}else{

			engine.setValue(group, "hotcue_" + hotCue + "_activate", 0);
		}
	}
}


NumarkMTPII.toggleDeleteKey = function(channel, control, value, status, group){
	if (!value) return;

	var deck = NumarkMTPII.groupToDeck(group);
	NumarkMTPII.deleteKey[deck-1] = !NumarkMTPII.deleteKey[deck-1]; 
	NumarkMTPII.setLED(NumarkMTPII.leds[deck]["deleteKey"], NumarkMTPII.deleteKey[deck-1]);
}


