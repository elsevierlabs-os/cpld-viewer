# Content Profile and Linked Document Viewer

The CP/LD viewer is a Visual Studio Code extension that allows you to view and browse CP/LD compliant documents inside VSCode. CP/LD is a new standard developed by the NISO CP/LD Working group, see <https://github.com/niso-standards/cpld>. In short, a CP/LD file is an HTML file that links or embeds JSON-LD (akin to Google Structured Data).

## License
This code was originally developed by Elsevier B.V. (@RinkeHoekstra, @andyElsevier) and was contributed to the NISO CP/LD working group under an MIT license. See the `LICENSE.md` file for details.

## What it does

* You can open an HTML file in VSCode, and then run the `CPLD Viewer` command from the command pallette.
* The HTML file should contain JSON-LD data, or have links to it
  * Any linked JSON-LD data will be inserted into the HTML for further processing by the extension
  * Use `<script type="application/ld+json">...</script>` or `<link type="application/ld+json" rel="describedby" href="PATH_TO_JSONLD_FILE" />` inside the `<head>` of the file.
* When hovering over an annotated part of the document (i.e. an element with an `id` atttribute that matches one of the defined parts of the article in JSON-LD), it will:
  * Display the triples in which the resource indicated by the value of the attribute appears as *subject* or *object*.
* When clicking on one of the resources displayed in the triples, it will:
  * Try to **retrieve** a JSON-LD description of the resource from its URI, and add the retrieved statements to the store.
  * Display the triples in which this resources appears as *subject* or *object*.

## Installation

Download a `*.vsix` package from the releases page for this repository and run the `"Install from VSIX..."` command in VSCode.

The `CPLD Viewer` command will appear in your command pallette (`Cmd-Shift-P` or `Ctrl-Shift-P`) whenever an HTML file is opened in your editor. The CPLD viewer will appear in a new pane next to your open document.

## Configuration Options

The viewer has a number of configuration options that can be modified in the Settings pannel (`Cmd-,` or `Ctrl-,`)

### Allow Local Images
Set this to `true` if you want the viewer to allow loading local images into the HTML viewer. This is disabled by default (loading from URLs is allowed). Any local images should be in a `media` directory relative to the HTML file being viewed.

### Allow Local Styles
Set this to `true` if you want the viewer to allow loading local CSS into the HTML viewer. This is disabled by default (loading from URLs is allowed). Any local images should be in a `media` directory relative to the HTML file being viewed.

### Always Dereference IRIs
When set to `true`, every time an IRI resource is clicked in the UI, the extension will attempt to dereference the IRI and populate the internal store with the retrieved triples.

### Has Part IRI
The viewer uses a "has part" relation to determine what the relevant parts of the document are that need to be used to show associated triples. The default is `https://schema.org/hasPart`. If your data does not show up in the viewer, make sure the "has part" relation in the setting matches the one in your data.

### Load Local Contexts
Standard JSON-LD libraries will only load files through dereferencing, or assume that the JSON-LD file is hosted on an HTTP server. Setting this option to `true` will make the extension attempt to load JSON-LD context files from a local path. This means that a JSON-LD file can refer to its context using an abbreviated IRI.

### Proxy Enabled
The extension will use a proxy to dereference IRIs, rather than attempt to dereference them directly. This is useful when the Linked Data is not dereferencable directly, or for security reasons.

### Proxy URL prefix
Specifies the URL prefix to use when the proxy is enabled. This value will simply be prepended to any IRI when trying to dereference.

## Building from Source

* Clone this repository, and cd into the directory
* Open the directory in VSCode (e.g. `code .`)
* Run `npm install` from the commandline (either inside VSCode or in your terminal)
* Run the extension development tool by pressing F5, a new window will appear with the extension installed.
  * You may have to run `npm build` to trigger the webpack build that produces a `cpldviewer.js` file that is injected in the HTML DOM.
* Updates to the code of the extension can be seen by reloading the new window.

## Contributing

Contributions are more than welcome! Please make your changes in a new branch and create a pull request when done.

Packaging your own version:

* Update the version number in `package.json`
* Run `vsce package` from the command line (make sure you have `vsce` installed)