// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { config } from 'process';





// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('cpld-viewer is active');

	context.subscriptions.push(
		// The command has been defined in the package.json file
		// Now provide the implementation of the command with registerCommand
		// The commandId parameter must match the command field in package.json
		vscode.commands.registerCommand('cpld.show', () => {
			CPLDViewer.createOrShow(context);
		})
	);

	

	vscode.workspace.onDidSaveTextDocument(event => {
		CPLDViewer.update(event, context);
	}, null, context.subscriptions);

}

// this method is called when your extension is deactivated
export function deactivate() {} 


class CPLDViewer {

	private static _panels: Map<string, vscode.WebviewPanel> = new Map<string, vscode.WebviewPanel>();

	private static _jsonld_to_html: Map<vscode.Uri, Array<vscode.TextDocument>> = new Map<vscode.Uri, Array<vscode.TextDocument>>();

	public static update(document: vscode.TextDocument, context: vscode.ExtensionContext) {

		const documentName = document.uri.path.split('/').slice(-1).join();

		if (CPLDViewer._panels.has(documentName)){
			CPLDViewer.createOrShow(context);
		} else if (CPLDViewer._jsonld_to_html.has(document.uri)) {
			// This is a JSON-LD document that has been edited.
			const html_documents = CPLDViewer._jsonld_to_html.get(document.uri);
			html_documents?.forEach( doc => {
				CPLDViewer.createOrShow(context, doc)
			});
		}
	}

	// Adds the html_filename to the array of related files for a jsonld_filename  so that we can monitor for save events. 
	public static addJSONLDPath(html_filename: vscode.TextDocument, jsonld_file_path: vscode.Uri){
		let html_filename_array = CPLDViewer._jsonld_to_html.get(jsonld_file_path);
		if (html_filename_array == undefined){
			html_filename_array = new Array<vscode.TextDocument>();
		} 
			
		if (html_filename_array.indexOf(html_filename) == -1){
			html_filename_array.push(html_filename);

			CPLDViewer._jsonld_to_html.set(jsonld_file_path, html_filename_array);
		}

	}

	public static createOrShow(context: vscode.ExtensionContext, document?: vscode.TextDocument) {

		// Determine the document to load, either from the function call, or through the context.
		if (document == undefined) {
			const editor = vscode.window.activeTextEditor;
			if (editor != undefined){
				document = editor.document
			} else {
				vscode.window.showErrorMessage("Could not determine document to load");
				console.error("Could not determine document to load");
				return;
			}
		} 
		

		// Get the local filename.
		const documentName = document.uri.path.split('/').slice(-1).join();

		const mediaPath = vscode.Uri.file(path.join(path.dirname(document.fileName), 'media'));
		const extensionMediaPath = vscode.Uri.file(path.join(context.extensionPath, 'media'));

		var localResourceRoots = [extensionMediaPath];
		let config = vscode.workspace.getConfiguration("cpld");
		// If either allowLocalStyles or allowLocalImages is true, we allow access to the `media` directory relative to the HTML file.
		if(config.get('allowLocalStyles') || config.get('allowLocalImages')){
			vscode.window.showWarningMessage(`Security warning. Allow local styles is ${config.get('allowLocalStyles')}, and allow local images is ${config.get('allowLocalImages')}`);
			localResourceRoots.push(mediaPath);
		}

		

		var panel:vscode.WebviewPanel;
		var existingPanel = CPLDViewer._panels.get(documentName);
		if (existingPanel != undefined) {
			panel = existingPanel ;
			panel.title = `CPLD: ${documentName} `;
		} else {
			// Create and show panel
			panel = vscode.window.createWebviewPanel(
				'cpld',
				`CPLD: ${documentName} `,
				vscode.ViewColumn.Active,
				{
					// Only allow access to the 'media' directory in the extension, the 'media' directory in the directory of the file being loaded is optional (see above).
					localResourceRoots: localResourceRoots,
					enableScripts: true,
					enableCommandUris: true,
					enableFindWidget: true
				}
			);
			CPLDViewer._panels.set(documentName,panel);

			panel.onDidDispose( () => {
				CPLDViewer._panels.delete(documentName);

				// Make sure that the CPLD document is no longer listed as belonging to a JSON-LD file, 
				// otherwise a save to the JSON-LD file would trigger the CPLD Viewer to open again.
				CPLDViewer._jsonld_to_html.forEach( (html_docs, jsonld_doc) => {
					console.log(JSON.stringify(html_docs));
					console.log(jsonld_doc);


					if (document != undefined){
						var new_html_docs:Array<vscode.TextDocument> = new Array<vscode.TextDocument>();

						for (let html_doc of html_docs) {
							if (html_doc != document) {
								new_html_docs.push(html_doc);
							} 
							// Skip the document
						}

						CPLDViewer._jsonld_to_html.set(jsonld_doc, new_html_docs);
						console.log(JSON.stringify(new_html_docs));
						console.log(JSON.stringify(CPLDViewer._jsonld_to_html.get(jsonld_doc)));
					}
				});
			})
		}
		

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(
			message => {
			switch (message.command) {
				case 'alert': 
				vscode.window.showWarningMessage(message.text);
				return;
				case 'error': 
				vscode.window.showErrorMessage(message.text, {modal: true});
				return;
				case 'success':
				vscode.window.showInformationMessage(message.text);
				return;
				case 'open':
				vscode.env.openExternal(vscode.Uri.parse(message.text));
			}
			},
			undefined,
			context.subscriptions
		);

		// And set its HTML content
		getCPLDWebviewContent(panel.webview, context.extensionUri, document).then(function(html) {
			panel.webview.html = html;
			panel.reveal();
		});

		

		return;

	}

}



async function getCPLDWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<string> {
	// Get configuration parameters, such as Proxy, default hasPart relation, etc.
	let config = vscode.workspace.getConfiguration("cpld");
	let proxyEnabled = config.get('proxyEnabled', false);
	let proxyURLprefix = config.get('proxyURLprefix');
	let allowLocalImages = config.get('allowLocalImages', false);
	let allowLocalStyles = config.get('allowLocalStyles', false);
	let alwaysDereferenceIRIs = config.get('alwaysDereferenceIRIs', false);

	const documentText:string = document.getText();
	const documentFilename:string = document.fileName;

	if(!(documentFilename.toLowerCase().endsWith(".html") || documentFilename.toLowerCase().endsWith('.htm'))) {
		vscode.window.showWarningMessage(`This extension only works with HTML files. The file '${documentFilename}' does not look like html`);
	}

	// Get the local path to scripts run in the webview, then convert it to a uri we can use in the webview.
	const cpldviewer = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'js/cpldviewer.js'));

	// Build a DOM tree from the document's text
	const dom = new JSDOM(documentText);



	if(allowLocalImages) {
		const imgElements:Array<Node> = Array.from(dom.window.document.querySelectorAll("img"));
	
		for(let img of imgElements){
			var img_element: Element = <Element> img;
			var img_src_attr = img_element.attributes.getNamedItem('src');
	
			if (img_src_attr != undefined && !img_src_attr.value.startsWith('http') && !img_src_attr.value.startsWith('data:')) {
				const img_vscode_path = webview.asWebviewUri(vscode.Uri.file(path.join(path.dirname(document.fileName), img_src_attr.value)));
				img_src_attr.value = img_vscode_path.toString();
				img_element.attributes.setNamedItem(img_src_attr)
			}
		}
	}
	if(allowLocalStyles) {
		const styleElements:Array<Node> = Array.from(dom.window.document.querySelectorAll("link[rel='stylesheet']"));
	
		for(let style of styleElements){
			var style_element: Element = <Element> style;
			var style_href_attr = style_element.attributes.getNamedItem('href');
	
			if (style_href_attr != undefined && !style_href_attr.value.startsWith('http') && !style_href_attr.value.startsWith('data:')) {
				const img_vscode_path = webview.asWebviewUri(vscode.Uri.file(path.join(path.dirname(document.fileName), style_href_attr.value)));
				style_href_attr.value = img_vscode_path.toString();
				style_element.attributes.setNamedItem(style_href_attr)
			}
		}		
	}


	// Produce the required script tags to be put in the HTML head.
	const nonce = getNonce();
	
	var scriptsAndCSS:string = `
	<!--
	Use a content security policy to only allow loading images from https or from our extension directory,
	and only allow scripts that have a specific nonce.
	-->
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https:; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' 'unsafe-inline'; font-src ${webview.cspSource}; connect-src https: http: ;">
	
	<script nonce="${nonce}" src="${cpldviewer}"></script>
`;


	if (alwaysDereferenceIRIs) {
		vscode.window.showInformationMessage(`Will always attempt to dereference IRIs.`);
	}

	// Also pass the value when false.
	let meta:string = `\n<meta name="alwaysDereferenceIRIs" value="${alwaysDereferenceIRIs}"/>`
	scriptsAndCSS += meta

	if (proxyEnabled) {
		vscode.window.showInformationMessage(`Proxy enabled through ${proxyURLprefix}`);
		
		let meta:string = `\n<meta name="proxyURLprefix" url="${proxyURLprefix}"/>`
		scriptsAndCSS += meta
	} 

	// Parse the HTML to find link elements that point at external JSON-LD files
	// Inject them as scripts into the HTML file for the Extension to work.
	const linkElements:Array<Node> = Array.from(dom.window.document.querySelectorAll("link[type='application/ld+json'][rel='describedby']")); 

	// let jsonPaths:Array<string> = Array();
	const dirname = path.dirname(document.uri.fsPath); 

	for(let link of linkElements){
		const link_element: Element = <Element> link;
		const json_filename = link_element.attributes.getNamedItem('href')?.value;

		if (json_filename != undefined) {
			const json_filename_path = path.join(dirname, json_filename);

			const json_document = await vscode.workspace.openTextDocument(json_filename_path);
			// Add the documentName (html filename) to the mapping for this jsonld document so that we can monitor for updates.
			CPLDViewer.addJSONLDPath(document, json_document.uri)
			
			var json_text = JSON.stringify(await getJSONwithEmbeddedContext(json_document));

			scriptsAndCSS += `
				<script type="application/ld+json">
				${json_text}
				</script>
			`
		}
	}
	// Append the scripts and CSS to the document head.
	dom.window.document.head.innerHTML += scriptsAndCSS;

	// Return the updated document as string.
	return dom.window.document.documentElement.outerHTML;
  }


  async function getJSONwithEmbeddedContext(json_document: vscode.TextDocument) {
	const dirname = path.dirname(json_document.uri.fsPath);
	var json_text = json_document.getText();
	var json_object = JSON.parse(json_text);

	let config = vscode.workspace.getConfiguration("cpld");
	let loadLocalContexts = config.get('loadLocalContexts');

	if (!loadLocalContexts) {
		console.log("Not loading local contexts...");
		return(json_object);
	} else {
		vscode.window.showInformationMessage("Loading of local contexts enabled...");
	}

	try {
		var context = json_object['@context']
		if (typeof context === 'object' && context.constructor !== Array) {
			// This file has an object-context, returning as is.
			console.log("Context is an object");
			return json_object;
		} else if (typeof context === 'string') {
			// This file has a string as context, turning it into an array
			console.log("Context is a string, turning it into an Array")
			context = [context];
		}

		// If the context is an array, we're going to loop through the elements
		// for each element that is a string, we're going interpret that string as a filename, and will 
		// try to load the contents into an object, and inject it back into the context.
		if (context.constructor === Array) {
			console.log("Yay! Array!");
			let expandedContextArray:any[] = [];
			for (let c in context) {
				console.log(context[c]);
				if (typeof context[c] == 'string' && !context[c].startsWith('http')) {
					console.log("Context is a local file");
					try {
						const json_context_path = path.join(dirname, context[c]);
						const json_context_doc = await vscode.workspace.openTextDocument(json_context_path);
						expandedContextArray.push(JSON.parse(json_context_doc.getText()));
						vscode.window.showInformationMessage(`Including context from ${json_context_path}`);
					} catch (e: any) {
						vscode.window.showErrorMessage(e.message);
						console.log(e);
						console.log("Could not load context from file, perhaps it's not a file :-)");
						// Just passing through the value in the context array, as it may be an object or another array.
						expandedContextArray.push(context[c]);
					}
				} else {
					// Just passing through the value in the context array, as it may be an object or another array.
					expandedContextArray.push(context[c]);
				}
			}
			console.log(expandedContextArray);
			json_object['@context'] = expandedContextArray;
			console.log(json_object);
		}
	} catch (e: any) {
		vscode.window.showErrorMessage(e.message);
		console.log(e);
		console.log("Something went wrong while trying to load contexts from local files.");
	}
	return json_object;
}

  function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}