var chunksize = 65536;
var socket = io.connect('http://' + window.location.host);
var peers = [];
var sharedFiles = [];

var fileSystem;

$(document).ready(function() {
	setWorking(true);

	// SET UP THE FILESYSTEM FOR STORAGE OF DOWNLOADS
	window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

	window.requestFileSystem(window.TEMPORARY, 10*1024*1024*1024, function(fs) { 
		this.fileSystem = fs; 
	}, errorHandler);

	// SET UP THE MULTISCREEN INTERFACE
	$("#skip").click(function() {
		$("#upload").slideUp();
		$("#available").slideDown();
	});

	$("#upload-more").click(function() {
		$("#upload").slideDown();
		$("#available").slideUp();
	});

	// DRAG INITIALIZATION
	var dropZone = document.getElementById('drop_zone');
	dropZone.addEventListener('dragover', handleDragOver, false);
	dropZone.addEventListener('drop', handleFileSelect, false);

	// SEARCH
	$('.search').keyup(function(){
		$('.file_item').each(function(){
			var re = new RegExp($('.search').val(), 'i')
			if($(this).children('a')[0].innerHTML.match(re)){
				$(this).show();
			}else{
				$(this).hide();
	 		};
		});
	});

	window.onbeforeunload = function() {
        return "Leaving this page will remove all of your files from the site. Are you sure you want to do this?";
    }

	setWorking(false);
});

// SOCKET TRANSFER CONNECTIONS

socket.on('file_requested', function(data) {
	setWorking(true);

	var requesting_socket = data.from;
	var requesting_file = findFile(sharedFiles, data.file_name);

	var chunks = requesting_file.size/chunksize;
	if(chunks% 1 != 0){
		chunks = Math.floor(chunks) + 1;
	}

	var chunk = 0;

	for (chunk = 0; chunk < chunks; chunk++) {

		var fileReader = new FileReader();

		var start = chunk * chunksize;
		var stop;

		if((requesting_file.size - 1) <= start + chunksize - 1){
			stop = requesting_file.size - 1;
		}
		else{
			stop = start + chunksize - 1;
		}

		// If we use onloadend, we need to check the readyState.
		fileReader.onloadend = $.proxy(function(evt) {
			if (evt.target.readyState == FileReader.DONE) { // DONE == 2
				var data = evt.target.result;
				socket.emit('send_data', {to: requesting_socket, body: {data: data, chunk_number: this.current, total_chunks: this.total, file_name: requesting_file.name}});
				if (this.current + 1 == this.total) { setWorking(false); }
			}
		}, {current: chunk, total: chunks});

		if (requesting_file.webkitSlice) {
			var blob = requesting_file.slice(start, stop + 1);
		} else if (fileo.mozSlice) {
			var blob = requesting_file.slice(start, stop + 1);
		}
				
		fileReader.readAsBinaryString(blob);

	}
});

function runDownload(downloadPeerId, fileName, callback, on_progress) {
	console.log("Starting Download.");
	setWorking(true);
	var peerList;
	findPeer(downloadPeerId, function(peer) { peerList = peer.files; });
	var file = findFile(peerList, fileName);

	socket.emit('request_file', {to: downloadPeerId, fileName: fileName});

	var downloaded_data = {};
	var array_data = [];

	on_progress(0);

	socket.on('receive_data' + fileName, function(data) {
		downloaded_data[data.chunk_number] = data.data;
		array_data.push(data.data);
		on_progress(data.chunk_number / data.total_chunks);
		if(Object.keys(downloaded_data).length == data.total_chunks) {
			console.log("Finished Download");
			var final_data = [];
			for(var chunk = 0; chunk < data.total_chunks; chunk++) {
				var temp_data = downloaded_data[chunk];
				var buf = new ArrayBuffer(temp_data.length);
				var bufView = new Uint8Array(buf);
				for (var i=0, strLen=temp_data.length; i<strLen; i++) {
					bufView[i] = temp_data.charCodeAt(i);
				}
				final_data.push(bufView);
			}
			fileSystem.root.getFile(fileName, {create: true}, function(fileEntry) {
				fileEntry.createWriter(function(fileWriter) {
					fileWriter.onwriteend = function(e) {
						console.log('Write completed.');
						var data_uri = fileEntry.toURL();
						setWorking(false);
						callback(data_uri);
					};

					fileWriter.onerror = function(e) {
						console.log('Write failed: ' + e.toString());
					};

					// Create a new Blob and write it to log.txt.
					//var file_type = file.type
					//if (file_type == "") { file_type = "application/octet-stream"; }
					var blob = new Blob(final_data, {type: "application/octet-stream"});

					fileWriter.write(blob);
				}, errorHandler);
			}, errorHandler);
			socket.removeAllListeners('receive_data' + fileName);
		}
	});
}

// BASIC SOCKET CONNECTIONS

socket.on('client_list', function(data) {
	peers = data;
	listPeers(peers);
	listFiles(peers);
});

socket.on('new_peer', function(data) {
	peers.push(data);
	listPeers(peers);
	listFiles(peers);
});

socket.on('peer_disconnect', function(data) {
	removePeer(data);
	listPeers(peers);
	listFiles(peers);
});

socket.on('sharing_files', function(data) {
	findPeer(data.peer_id, function(peer) {
		peer.files = data.files;
	});
	listFiles(peers);
});

// DISPLAY HELPERS...

function listPeers(list) {
	var search = $('.search')[0];
	search.setAttribute('data-peers', peers.length);
	search.setAttribute('placeholder', 'search ' + search.getAttribute('data-files') + ' files from ' + peers.length + ' people...');
}

function listFiles(list) {
	$('#files ul')[0].innerHTML = "";
	var fileCount = 0;
	for(var i = 0; i < list.length; i++) {
		fileCount += list[i].files.length;
		for (var j = 0; j < list[i].files.length; j++) {
			$('#files ul')[0].innerHTML += ("<li data-id='" + list[i].id + "' class='file_item'><a href='javascript:void(0);' onclick='downloadFile(this);'>" + list[i].files[j].name + "</a></li>");
		}
	}
	var search = $('.search')[0];
	search.setAttribute('data-files', fileCount);
	search.setAttribute('placeholder', 'search ' + fileCount + ' files from ' + search.getAttribute('data-peers') + ' people...');
}

function downloadFile(e) {
	var parent = $(e.parentElement);
	parent.append("<div class='pull-right' id='" + e.innerHTML + "_right'></div>");
	var holder = parent.children()[1];
	runDownload(parent[0].getAttribute('data-id'), e.innerHTML, 
		function(finished_uri) {
			$(holder).html("<a class='btn btn-primary btn-small' href='" + finished_uri +"' target='_blank'>Open</a>");
		},
		function(progress) {
			$(holder).html("<div class='progress' style='width: 150px'><div class='bar' style='width: " + (progress * 100) + "%'></div></div>");
			$(parent).hide().show();
		}
	);
}

// DRAG HANDLERS - WHAT HAPPENS WHEN I 'UPLOAD' FILES
function handleFileSelect(evt) {
	evt.stopPropagation();
	evt.preventDefault();

	var files = evt.dataTransfer.items;

	var output = $('#fileList')[0];
	//sharedFiles = [];
	$('.upload-box h1').hide();

	function processFile(f) {
		console.log(f.name);
		if (f.size > 1000*1000*1000) {
			alert('Could not use ' + f.name + ' because the file was larger than 1GB.' +
				'\n\n We cannot currently use files over 1GB due to limits in Chrome.');
			return;
		}
		if (f.name == ".DS_Store" || f.name == "thumbs.db") { return; }
		if ($.inArray(f.name + f.size + f.type, sharedFiles.map(function(object) { return object.name + object.size + object.type })) != -1) { return; }
		sharedFiles.push(f);
		output.innerHTML += ['<li><strong>', f.name, '</strong><br/> (', f.type || 'n/a', ') - ',
			f.size, ' bytes, last modified: ',
			f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
			'</li>'].join('');
	}

	function loadFiles(files) {
		for (var i = 0; i < files.length; i++) {
			var f, e;
			if (files[i].isFile || files[i].isDirectory) {
				e = files[i];
			} else {
				f = files[i].getAsFile();
				e = files[i].webkitGetAsEntry();
			}
			if(e.isFile) {
				if (f === undefined) {
					e.file(function(file) {
						console.log("load file;");
						processFile(file);
					}, function(error) { console.log('error opening file.') });
				} else {
					processFile(f);
				}
			} else if (e.isDirectory) {
				var reader = e.createReader();
				reader.readEntries(function(traversedEntries) {
					loadFiles(traversedEntries);
				});
			}
		}
	}

	loadFiles(files);
	$('#skip').addClass('btn-primary');
	$('#skip')[0].innerHTML = "Done >>";

	window.setTimeout(function() {
		socket.emit('sharing_files', sharedFiles);
	}, 1000);
}

function handleDragOver(evt) {
	evt.stopPropagation();
	evt.preventDefault();
	evt.dataTransfer.dropEffect = 'copy';
}

// Helper Function Definitions

function findFile(list, fileName) {
	for(var i = 0; i < list.length; i++) {
		if(list[i].name == fileName) { return list[i]; }
	}
}

function findPeer(id, callback) {
	for (var i = 0; i < peers.length; i++) {
		if(peers[i].id = id) { callback(peers[i]); }
		return;
	}
}

function removePeer(data) {
	for(var i = 0; i < peers.length; i++) {
		if (peers[i].id == data.id) {
			peers.splice(i, 1);
			return;
		}
	}
}

function setWorking(working) {
	if(working) {
		$('.floater').show();
		$('.search').css('padding-right', '0');
	} else {
		$('.floater').hide();
		$('.search').css('padding-right', '32px');
	}
}

// Library Helper Functions

function errorHandler(e) {
  var msg = '';

  switch (e.code) {
	case FileError.QUOTA_EXCEEDED_ERR:
	  msg = 'QUOTA_EXCEEDED_ERR';
	  break;
	case FileError.NOT_FOUND_ERR:
	  msg = 'NOT_FOUND_ERR';
	  break;
	case FileError.SECURITY_ERR:
	  msg = 'SECURITY_ERR';
	  break;
	case FileError.INVALID_MODIFICATION_ERR:
	  msg = 'INVALID_MODIFICATION_ERR';
	  break;
	case FileError.INVALID_STATE_ERR:
	  msg = 'INVALID_STATE_ERR';
	  break;
	default:
	  msg = 'Unknown Error';
	  break;
  };

  console.log('Error: ' + msg);
}
