import $ from 'jquery';
window.jQuery = $;
window.$ = $;
import 'bootstrap4';
const jsonld = require('jsonld');
var $rdf = require('rdflib');
import 'shacl-js';
import 'bootstrap4/dist/css/bootstrap.css';
import css from './cpldviewer.css';



global.$ = global.jQuery = $;

// Acquire the VSCode API object for passing messages.
var vscode;
try {
  vscode = acquireVsCodeApi();
} catch (e) {
  if (e instanceof ReferenceError) {
      vscode = undefined;
  }
}



// Display CPLD documents (HTML+JSONLD) showing content and data
// Contributors: Rinke Hoekstra, Andy Townsend

// Linked Data setup
var store;
var serializer;
var documentIRI;

var documentBaseURI = document.baseURI;	// n.b. Deprecated in favour of documentIRI

var ALWAYS_RETRIEVE = false; // Whether to always try to dereference IRIs when clicked. Default: false. Can be set through the UI.

// Layout spacing
const LED_LAYOUT_TOP = 60;

// Config
const LED_BREAKFAST_TOAST = true;		// Whether to have document toast at startup.
const LED_AUTOHIDE_TOAST = false;		// Whether to hide toast on hover.out
const LED_COMPACT_TRIPLES = true;		// Whether to suppress target IRI in toasts
const LED_ELIPSIS_SOFT = 20;			// Length at which to elipsis URIs
const LED_ELIPSIS_HARD = 14;			// Length at which to elipsis URIs

const LED_RDFA = false;				// Whether to look for RDFa - should not be needed now.

const LED_CSS_HIGHLIGHT = "cpld cpld-highlight";	// CSS class to highlight content
const LED_CSS_BOX = "cpld-box";		// CSS class to box content
const LED_CSS_DECORATED = "cpld cpld-decorated"

const OA_HAS_TARGET = "http://www.w3.org/ns/oa#hasTarget"; // Open Annotation hasTarget URI
const OA_HAS_BODY = "http://www.w3.org/ns/oa#hasBody"; // Open Annotation hasBody URI
const OA_HAS_SELECTOR = "http://www.w3.org/ns/oa#hasSelector"; // Open Annotation hasSelector URI
const OA_XPATH_SELECTOR = "http://www.w3.org/ns/oa#XPathSelector"; // Open Annotation XPathSelector URI
const OA_TEXTPOSITION_SELECTOR = "http://www.w3.org/ns/oa#TextPositionSelector"; // Open Annotation TextPositionSelector URI
const OA_XPATH = "http://www.w3.org/1999/02/22-rdf-syntax-ns#value"; // Value of the XPathSelector
const OA_REFINED_BY = "http://www.w3.org/ns/oa#refinedBy"; // Open Annotation refinedBy URI
const OA_START = "http://www.w3.org/ns/oa#start"; // Open Annotation text range start
const OA_END = "http://www.w3.org/ns/oa#end"; // Open Annotation text range end

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDF_VALUE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#value";


// --- Startup ---

// Activate if have an ID and JSON datablock
$(function () {
  // NB these are global variables
  documentIRI = $('meta[name="id"]').attr('content');
  if ( documentIRI == undefined && vscode != undefined) {
    vscode.postMessage({
      command: 'alert',
      text: "Could not find Document IRI in file. Are you sure it's an HTML file?"
    });
    return;
  } else if (documentIRI == undefined) {
    alert("Could not find Document IRI in file. Are you sure it's an HTML file?");
    return;
  }

  // ALWAYS_RETRIEVE should be (boolean) true when the attribute value is (string) 'true', otherwise, it should remain false.
  ALWAYS_RETRIEVE = ( $('meta[name="alwaysDereferenceIRIs"]').attr('value') === 'true' );
  console.log(ALWAYS_RETRIEVE);

  store = $rdf.graph();
  serializer = $rdf.Serializer(store);

  var datablockJSON = $("script[type='application/ld+json']");
  if (datablockJSON != undefined && datablockJSON.length > 0) {
    console.log(`Found ${datablockJSON.length} data blocks`);

    prepareLED(datablockJSON).then( () => {

      console.log("Preparing Layout");
      prepareLayout();
      credits();
      if (LED_BREAKFAST_TOAST) {
        showToastForUriStr(documentIRI);
      }

    });    
  } 

  
});

// Wrap the body content in 3 column layout, right column for toasts, left for aesthetics
function prepareLayout() {
  $("body").wrapInner('<div id="cpld-body-container" class="container-fluid"></div>');
  $("#cpld-body-container").wrapInner('<div id="cpld-body-wrapper" class="d-flex flex-row align-items-stretch"></div>');
  $("#cpld-body-wrapper").wrapInner('<div id="cpld-body-content" class="p-8"></div>');
  $("#cpld-body-wrapper").prepend(`<div id="cpld-body-left" class="p-1"></div>`);
  $("#cpld-body-wrapper").append(`<div id="cpld-body-right" class="p-3"></div>`);
  $("#cpld-body-right").append(`<div id="cpld-toast-panel"/>`);

  $("#cpld-toast-panel").css('position', 'fixed');
  $("#cpld-toast-panel").css('top', `0px`);
  $("#cpld-toast-panel").css('right', 0);
  $("#cpld-toast-panel").css('max-height', `calc(100% - ${LED_LAYOUT_TOP}px)`);
  $("#cpld-toast-panel").css('overflow-y', 'hidden');

  prepareNavbar();
}

// Build and insert a responsive bootstrap navbar
function prepareNavbar() {
  // The core of the navbar - branding and the toggle/menu button.  Collapses #cpld-navbar if width < lg
  const nav = $('' +
    '<nav class="navbar navbar-light bg-light navbar-expand-md fixed-bottom">' +
    '<button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#cpld-navbar" aria-controls="cpld-navbar" aria-expanded="false" aria-label="Toggle navigation">' +
    '<span class="navbar-toggler-icon"></span>' +
    '</button>' +
    '</nav>');

  // The responsive / collapsable part of the navbar
  const navbarNav = $('<div id="cpld-navbar"></div>');

  // Create nav controls for the responsive part: the doc IRI and the validate button
  const documentIRI = $('meta[name="id"]').attr('content');
  const navbarNavUl = $('' +
    '<ul class="navbar-nav collapse navbar-collapse">' +
    '<li class="nav-item">' +
    '<a id="cpld-document-uri" class="btn btn-outline-info mx-1" alt="'+ documentIRI + '" resource="' + documentIRI + '" onclick="this.blur();" href="#">' + documentIRI + '</a> ' +
    '</li>' +
    '<li class="nav-item">' +
    '<a id="cpld-statement-count" class="btn btn-info mx-1" alt="Number of triples" onclick="this.blur();" href="#">#0</a> ' +
    '</li>' +
    // '<li class="nav-item">' +
    // '<a id="cpld-validate-btn" class="btn btn-secondary mx-1" onclick="this.blur();" href="#">Validate: -/-</a>' +
    // '</li>' +
    '<li class="nav-item">' +
    '<a id="cpld-clear-btn" class="btn btn-info float-left  mx-1" alt="Clear toasts" onclick="this.blur();" href="#">Clear' +
    '</li>' +
    '</ul>');
  navbarNav.append(navbarNavUl);

  // Assemble and insert the navbar
  nav.append(navbarNav);
  $('body').prepend(nav);
  $('body').css("padding-bottom", `${LED_LAYOUT_TOP}px`);

  // Connect the validate button
  $('#cpld-validate-btn').click(function () {
    validate();
  });

  // Connect the clear button
  $('#cpld-clear-btn').click(function () {
    $('#cpld-toast-panel').empty();
  });

  // Connect the credits button
  $('#cpld-navbar-icon').click(function () {
    credits();
  });
}

// Read in the JSON-LDs and any RDFa and add interactivity
function prepareLED(datablockJSON) {

  return new Promise((resolve, reject) => {
    var loadPromises = [];
    var jsonArray = []
    datablockJSON.each(function (index) {
      console.log(`Preparing data block ${index}`);
      try {
        var json = JSON.parse($(this).text());
        suggestContextPrefixes(json, serializer);
        
        jsonArray.push(json);
      } catch (e) {
        if ( vscode != undefined) { 
          vscode.postMessage({
            command: 'alert',
            text: `Encountered an issue when loading the JSON. Perhaps it's not syntactically correct?`
          });
        }
        console.log(e);
        console.log(`Encountered an issue when loading the JSON. Perhaps it's not syntactically correct?`);
      }
      
    });
  
    loadPromises.push(loadJSONLD(jsonArray));
  
    Promise.all(loadPromises).then((values) => {	// n.b. only a success handler
      console.log("Processing annotations");
      // Go over any annotations that have an XPathSelector with a TextRangeSelector in them.
      let hasTarget = $rdf.sym(OA_HAS_TARGET);
      let annotations = store.each(undefined, hasTarget);
  
      annotations.forEach(function (annotation) {
        const annotationURI = annotation.value;
  
        const targets = store.each(annotation, hasTarget)
        targets.forEach(function (target) {
          var selectors = store.each(target, $rdf.sym(OA_HAS_SELECTOR));
          if(selectors != undefined) {
            selectors.forEach(function (selector) {
              let types = store.each(selector, $rdf.sym(RDF_TYPE));
              for (const i in types) {
                if (types[i].value === OA_XPATH_SELECTOR) {
                  let xpathValue = store.any(selector, $rdf.sym(RDF_VALUE)).value;
                  console.log("XPATH");
                  console.log(xpathValue);
                  let matches = document.evaluate(xpathValue, document, null, XPathResult.ANY_TYPE, null)
                  console.log(matches)
                  let parentNode = matches.iterateNext()
                  console.log(parentNode)
                  // Make sure we only continue if the XPath expression evaluates to a node.
                  while (parentNode) {
                    let refinements = store.each(selector, $rdf.sym(OA_REFINED_BY));
                    refinements.forEach(function (positionSelector) {
                      var start = store.any(positionSelector, $rdf.sym(OA_START)).value;
                      var end = store.any(positionSelector, $rdf.sym(OA_END)).value;
    
                      let fragmentId = `annotation-target-${slugify(annotationURI)}`;
    
                      // Wrap the range in a span, and decorate with the correct attributes
                      setRange(parentNode, fragmentId, start, end, annotationURI);
                    });
    
                    // TODO: Cannot iterate as the document changes when a new span is inserted. Need to fix this to support multiple matches to the XPath expression.
                    // parentNode = matches.iterateNext()
                    parentNode = undefined;
                  }
    
    
                }
              }
            });
          }
        });
  
  
  
      });
  
      // Decorate the HTML with "resource" attributes
      // Go over all parts of the document
      let hasBody = $rdf.sym(OA_HAS_BODY);
  
      let allTriples = store.statementsMatching(undefined, undefined, undefined, undefined);
      let bodyTriples = store.statementsMatching(undefined, hasBody, undefined, undefined);
      let targetTriples = store.statementsMatching(undefined, hasTarget, undefined, undefined);
  
  
  
      console.log("Starting decoration of everything");
      allTriples.forEach(function (candidate) {
        try {
          decorateElement(candidate.object.value);
          decorateElement(candidate.subject.value);
        } catch (err) {
          console.log("Attempting to decorate non-existent element");
          console.log(err);
        }
      });
  
      let candidates = bodyTriples.concat(targetTriples);
  
      console.log("Starting decoration of annotation body/target");
      candidates.forEach(function (candidate) {
        try {
          let resourceURI = candidate.object.value;
          let annotationURI = candidate.subject.value;
          decorateElement(resourceURI, annotationURI);
        } catch (err) {
          console.log("Attempting to decorate non-existent element or body/target is not a uri");
          console.log(err);
        }
      });
  
      // Add the decorated class to all elements with a 'resource' attribute.
      $("*[resource]").addClass(LED_CSS_DECORATED);
  
      // Now HTML is decorated add hover behaviour
      // If hovering over an element with a @resource attribute, render the resource URI.
      $("*[resource]").on("mouseover", function(){
        var uristr = $(this).attr('resource');
        highlightToastForUriStr(uristr, true);
      })
      
      $("*[resource]").on("mouseout", function(){
        var uristr = $(this).attr('resource');
        if (LED_AUTOHIDE_TOAST) {
          hideToastForUriStr(uristr)
        } else {
          highlightToastForUriStr(uristr, false);
        }
      });
  
      // Only show toast on click to make the interface less jittery.
      $("*[resource]").on("click", function(){
        var uristr = $(this).attr('resource');
        showToastForUriStr(uristr);
        highlightToastForUriStr(uristr, true);
      })
  
  


      if (LED_RDFA) {
        // Not expected with current spec, but load any RDFa found in the file
        var p = new $rdf.RDFaProcessor(store, { 'base': document.baseURI });
        p.process(document);
      }
    
      // Show number of statements loaded (promises may update this further later)
      $("#cpld-statement-count").text("#" + store.length);
  
      resolve();
    });
  

  });
}

function decorateElement(resourceURI, annotationURI = undefined) {
  let splitURI = resourceURI.split('#');
  let targetURI
  // When anno
  if (annotationURI) {
    targetURI = annotationURI
  } else {
    targetURI = resourceURI
  }

  if (splitURI.length === 2) {
    $("#" + splitURI[1]).attr('resource', resourceURI);
    console.log(`Decorating HTML element #${splitURI[1]} with resource URI: ${targetURI}`);
  }
}

function getTextNodesIn(node) {
  var textNodes = [];
  if (node.nodeType == 3) {
    textNodes.push(node);
  } else {
    var children = node.childNodes;
    for (var i = 0, len = children.length; i < len; ++i) {
      textNodes.push.apply(textNodes, getTextNodesIn(children[i]));
    }
  }
  return textNodes;
}

function setRange(el, fragmentId, start, end, annotationURI) {
  if (document.createRange && window.getSelection) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var textNodes = getTextNodesIn(el);
    var foundStart = false;
    var charCount = 0, endCharCount;

    for (var i = 0, textNode; textNode = textNodes[i++];) {
      endCharCount = charCount + textNode.length;
      if (!foundStart && start >= charCount
        && (start < endCharCount ||
          (start == endCharCount && i <= textNodes.length))) {
        range.setStart(textNode, start - charCount);
        foundStart = true;
      }
      if (foundStart && end <= endCharCount) {
        range.setEnd(textNode, end - charCount);
        break;
      }
      charCount = endCharCount;
    }
    console.log("Creating new span element with id " + fragmentId + " for annotation " + annotationURI);
    var newParent = document.createElement('span');
    newParent.setAttribute('id', fragmentId);
    newParent.setAttribute('resource', annotationURI);

    try {
      range.surroundContents(newParent);
    } catch (err) {
      console.log(`Could not create span with range ${start}-${end} for annotation ${annotationURI}`);
      console.log(el);
      console.log(err);
    }

  }
}


// --- Validation ---

// We want to be able to validate against multiple schema.  The challenges are:
// a. Several steps are asynchonous so validations may overlap if not careful
// a. If we are not careful the validations may overlap because each step is async
// b. If we read all schema into "store" then overlapping validations may encounter
//    partially loaded schemas.
// c. Even we we sequence the validations, if we read all schemas into  "store" then
//    each validation step will be cumulative, i.e. Validate A; Validate A+B; Validate A+B+C ...
//    will be repeating the previous toor, i.e. Validate A; Validate A+B; Validate A+B+C
//    so if are errors in Validate A those errors will repeat in Validate A+B and so on.
// Options:
// 1. Read in all external schemas and perform one validation step. one report, just PASS or FAIL
//    Con: Just one report, PASS or FAIL, no schema by schema report.
// 2. Sequence the validations and read schema into a separate validation store
//    Con: Triples not loaded into main store, no check on combined-schema consistency
// Using option 2 for now.


// Validate against all/any listed schemas
function validate() {
  console.log("Validating...");
  var conformsTo = $rdf.sym("http://www.w3.org/ns/shacl#shapesGraph");

  // If there is a conformsTo / sh:shapesGraph predicate
  const schemaURIs = store.statementsMatching(undefined, conformsTo, undefined, undefined);
  var schemasNum = 0;
  var schemasPass = 0;
  var schemasFail = 0;

  console.log(`Found ${schemaURIs.length} schema URIs`);
  if (schemaURIs.length === 0) {
    $('#cpld-validate-btn').removeClass('btn-secondary').addClass('btn-warning');
    $('#cpld-validate-btn').text("Validate: 0/0");
    return;
  } else {
    schemasNum = schemaURIs.length;
    $('#cpld-validate-btn').removeClass('btn-secondary').removeClass('btn-danger').removeClass('btn-info').addClass('btn-warning');
    $('#cpld-validate-btn').text(`Validate: 0/${schemasNum}`);
  }

  // Build a chain of Promises so each _async_ validation happens one-by-one
  schemaURIs.reduce(function (chainPromise, triple) {
    return chainPromise.then(function () {
      const schemaURIstr = triple.object.value;
      console.log(`Checking conformance against ${schemaURIstr}`);
      return promiseJSON(schemaURIstr).then((json) => {
        console.log(`Validate: Loading SHACL as JSON-LD`);
        return loadJSONLD(json, $rdf.graph());
      }).then((shapes) => {
        return new Promise((resolve, reject) => {
          var validator = new SHACLValidator();
          console.log("Validate: calling validator...");
          validator.validateFromModels(store, shapes, function (e, report) {
            console.log(`Validate: Conforms to ${schemaURIstr}? ${report.conforms()}`);
            if (report.conforms() === false) {
              schemasFail++;
              report.results().forEach(function (result) {
                console.log(" - Severity: " + result.severity() + " for " + result.sourceConstraintComponent());
              });
            } else {
              $('#cpld-validate-btn').text("Validate: " + ++schemasPass + "/" + schemasNum);
            }
            resolve(true);  // resolve after validation complete
          });
        });
      }).catch((e) => {
        console.log(e);
        schemasFail++;
      });
    });
  }, Promise.resolve()).then(function () {
    console.log("Validation complete: " + schemasPass + "/" + schemasNum);
    if (schemasPass === schemasNum) {
      $('#cpld-validate-btn').removeClass('btn-warning').addClass('btn-info');
    } else {
      $('#cpld-validate-btn').removeClass('btn-warning').addClass('btn-danger');
    }
  });

  console.log("End validate func. Validation is async.")
}

// --- Utilities ---

// Convert vanilla URI to displayable form for HTML
function safeURI(uri) {
  return serializer.atomicTermToN3(uri).
    replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Replacing quotes causes glitches, stop for now
  //    replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quote;').replace(/'/g,'&apos;');
}

// Convert vanilla URI to short displayable form for HTML
// Does not elipsis literals
function safeShortURI(uri, limit) {
  var n3 = safeURI(uri);

  if (n3.length > limit && !n3.startsWith('"')) {
    var left = n3.substring(0, limit / 2);
    var right = n3.substring(n3.length - (limit / 2));
    n3 = left + '...' + right;
  }
  return n3;
}

// Replace non-word characters with underscores (not guaranteed to be 1:1 unique)
function slugify(text) {
  return text.replace(/[^\w\-]+/g, '_');
}

// --- JSON-LD ---

// Promise wrapper for getting JSON, resolves with the data fetched
// $getJSON does have a promise wrapper but this is nice and clear and meets our needs
function promiseJSON(uristr) {
  return new Promise((resolve, reject) => {
    console.log(`Retrieving JSON from ${uristr}`);
    $.getJSON(uristr)
      .done((json) => { console.log(`DONE: Have data from ${uristr}`); resolve(json) })
      .fail((err) => { 
        console.log(`FAIL: Failed to get data from ${uristr}`); 
        console.log(err.getAllResponseHeaders());
        var contentType = err.getResponseHeader('content-type');
        console.log(contentType);
        if(contentType == 'text/html'){
          console.log("This is an HTML response. We may be dealing with a Schema.org response");
          resolve(loadSchemaOrg(err.responseText));
        } else if (contentType == 'text/turtle' || contentType == 'text/turtle; charset=utf-8') {
          console.log("This is a turtle response.");
          console.log(err.responseText);
          $rdf.parse(err.responseText, store, documentIRI, "text/turtle", function(){
            console.log("Parsed turtle into store directly...");
            // Resolve with an empty JSON-LD document.
            resolve(undefined);
          });
          
        } else {
          console.log("definitely not Schema.org");
          console.log(contentType);
        }
        reject(err);
      })
      .always(() => { console.log(`ALWAYS: ${uristr}`); });
  });
}

function loadSchemaOrg(response){
  var jsons = [];

  // Store the response in a temporary element, so that we can parse it into a DOM structure.
  var el = $( '<div></div>' );
  el.html(response);

  $("script[type='application/ld+json']", el).each(function(i){
    let json = $( this ).text();

    try {
      let parsedJSON = JSON.parse(json);
      jsons.push(parsedJSON);
    } catch (err) {
      console.log("Could not parse embedded JSON from (supposed) Schema.org response");
      console.log(err);
    }
  });
  return jsons;
}

// Load the JSON-LD contained in the 'json' object into a triple store and return resolved Promise
function loadJSONLD(json, rdfStore = store) {
  console.log("Loading JSON-LD")

  return new Promise((resolve, reject) => {
    try {
      // First convert to NQuads, then parse with rdflib.js as the latter cannot parse a JSON-LD document that is an Array.
      jsonld.toRDF(json, {format: 'application/n-quads'}).then(function(data){
        try {
          $rdf.parse(data, rdfStore, documentIRI, 'application/n-quads', function () {
            console.log("Successfully parsed: Statements in the graph: " + rdfStore.length);
            if (rdfStore === store) {
              $("#cpld-statement-count").text("#" +store.length);
            }
            console.log(`NextId: ${$rdf.BlankNode.nextId}`);
            $rdf.BlankNode.nextId = store.length + 1;
            console.log(`NextId: ${$rdf.BlankNode.nextId}`);
            resolve(rdfStore);
          });
        } catch (err) {
          console.log("Failed to load JSON-LD into triplestore!");
          console.log("used mimetype: " + mimeType);
          console.log("used documentIRI: " + documentIRI);
          console.log(data);
          console.log(err);
          reject(err);
        }
      });
    } catch (err) {
      console.log("Failed to convert JSON-LD to RDF!");
      console.log(json);
      console.log(err);
      reject(err);
    }
  });
}


// Pluck prefixes from the JSON-LD @context and push into the RDF serializer
// Only works for local contexts (not remote ones)
function suggestContextPrefixes(json, rdfSerializer) {
  var _processContext = function (contextObj) {
    Object.keys(contextObj).forEach((key) => {
      if (key.indexOf(':') < 0 && key.indexOf('@') < 0) {
        var prefix = "";
        if (typeof contextObj[key] === 'object' && !Array.isArray(contextObj[key]) && contextObj[key] !== null) {
          prefix = contextObj[key]["@id"];
        } else {
          prefix = contextObj[key];
        }
        rdfSerializer.suggestPrefix(key, prefix);
      } else if (key == '@context') {
        _getContext(contextObj[key]);
      }
    });
  };
  var _getContext = function (context) {
    if (Array.isArray(context)) {
      context.forEach((contextObj) => { _processContext(contextObj) });
    } else {
      _processContext(context);
    }
  };
  if (json != undefined) {
    if (Array.isArray(json)) {
      json.forEach((jsonObj) => { _getContext(jsonObj["@context"]) });
    } else {
      _getContext(json["@context"]);
    }
  }
}

// --- Interactions ---

// Retrieve JSONLD from a URI from the web, only if the URI does not yet appear as subject in the store
function retrieveAndShow(uristr) {
  if (store.statementsMatching($rdf.sym(uristr), undefined, undefined, undefined).length == 0 || ALWAYS_RETRIEVE) {
    console.log(`Retrieving because no triples contain ${uristr} as subject or ALWAYS_RETRIEVE is true`);
    // Indicate busy....
    $('#cpld-statement-count').removeClass('btn-info').addClass('btn-warning');

    let proxy_url = $('meta[name="proxyURLprefix"]').attr('url');
    
    var proxied_uristr = uristr;
    if(proxy_url != undefined) {
      proxied_uristr = `${proxy_url}${uristr}`;
    } 
    
    promiseJSON(proxied_uristr).then((json) => {
      // Load the JSON-LD response into the store
      if (json != undefined) {
        console.log("Adding retrieved data to store");
        return loadJSONLD(json);		// Returns Promise for graph
      }
    }).then((graph) => {
      console.log(`Showing toast for ${uristr}`)
      $('#cpld-statement-count').removeClass('btn-warning').addClass('btn-info');
      showToastForUriStr(uristr);
    }).catch((err) => {
      console.log(err);
      // Something failed, make sure to put button back...
      $('#cpld-statement-count').removeClass('btn-warning').addClass('btn-info');
      // Always show toast, even when the IRI does not appear as a subject anywhere.
      showToastForUriStr(uristr);
    });
  } else {
    showToastForUriStr(uristr);
  }
}

// Generate and show a toast for the given URI
function showToastForUriStr(uristr) {
  // This just assumes the URI is correct, it may fail!
  // Also assumes the URI is an absolute URI, not a CURIE
  var uri = $rdf.sym(uristr);

  // Generate the toast
  console.log(`Generating toast for ${uri}`);
  var toast = makeToastForURI(uri);
  // If a toast could be made, push in top of the toast panel and display it
  if (toast != undefined) {
    let toastID = toast.attr("id");
    $("#cpld-toast-panel").prepend(toast);
    $(toast).toast('show');
    try {
      $(`#${toastID}`).get(0).scrollIntoView(false);  // Make sure our toast can be seen
    } catch (e) {
      console.log(e);
      console.log(`Could not scroll to toast with id ${toastID}`);
    }
    
  } else {
    console.log(`Failed to make toast for ${uristr}`);
  }
}

// Remove a toast for given URI
function hideToastForUriStr(uristr) {
  var uri = $rdf.sym(uristr);
  var toastId = "toast-" + slugify(uri.uri);
  $("#" + toastId).remove();
}

// Highlight/Unhighlight a toast for given URI
function highlightToastForUriStr(uristr, highlight) {
  var uri = $rdf.sym(uristr);
  var toastId = "toast-" + slugify(uri.uri);
  if (highlight) {
    $(`#${toastId} .toast-header`).addClass(LED_CSS_HIGHLIGHT);
  } else {
    $(`#${toastId} .toast-header`).removeClass(LED_CSS_HIGHLIGHT);
  }
}

// Generate a dummy anchor with the appropriate style
function uriDummy(str, cls) {
  return $(`<div uri="#" class="${cls}">${str}</div>`);
}

// Generate an anchor element that is styled according to the cls variable.
// Click calls retrieveAndShow, hover highlights the relevant part of the document
function uriAnchor(uri, cls) {
  var uriN3 = safeShortURI(uri, (LED_COMPACT_TRIPLES ? LED_ELIPSIS_SOFT : LED_ELIPSIS_HARD));
  var uriA;

  if (uri.termType == "Literal") {
    uriA = $(`<div uri="#" class="${cls}">${uriN3}</div>`)
  } else {
    uriA = $(`<div uri="${uri.uri}" class="${cls} uri">${uriN3}</div>`);

    // Add a click handler for remote URIs
    uriA.on("click", function () {
      var u = $(this).attr('uri');
      retrieveAndShow(u);
      console.log("Performing a scroll to "+u);
      $("*[resource='" + u + "']").get(0).scrollIntoView({ block: "start", inline: "nearest" }) // Simple bring element into view, no library needed
      
    });

    uriA.on("dblclick", function(){
      if (vscode != undefined) {
        console.log("Double click " + uri.uri)
        const devUri = vscode.Uri.parse(uri.uri);
        vscode.commands.executeCommand('vscode.open', devUri);
      }
    })

    uriA.hover(function () {
      $("*[resource='" + uri.uri + "']").addClass(LED_CSS_BOX); // Mouse in
    }, function () {
      $("*[resource='" + uri.uri + "']").removeClass(LED_CSS_BOX); // Mouse out
    });
  }

  return uriA;
}

// Render all triples having uri as subject or object ready for a toast
// Returns undefined if the uri does not found in any triples
function renderTriplesForToast(uri) {

  // Get the triples in which this uri is either subject or predicate
  var predicates_objects = store.statementsMatching(uri, undefined, undefined, undefined)
  var subjects_predicates = store.statementsMatching(undefined, undefined, uri, undefined)

  if (predicates_objects.length > 0 || subjects_predicates.length > 0) {
    var message = $('<div/>');
    message.addClass("cpld-wrapper-wrapper");

    if (predicates_objects.length > 0) {
      var powrapper = $('<div/>');
      powrapper.addClass('cpld-triple-wrapper');
      for (var i = 0; i < predicates_objects.length; i++) {
        var po = predicates_objects[i];
  
        if (LED_COMPACT_TRIPLES) {
          powrapper.append(uriDummy("<i>this</i>", 'resource subject'));
        } else {
          let shorturi = safeShortURI(uri, (LED_COMPACT_TRIPLES ? LED_ELIPSIS_SOFT : LED_ELIPSIS_HARD));
          powrapper.append(uriDummy(shorturi, 'resource subject'));
        }
        powrapper.append(uriAnchor(po.predicate, 'resource predicate'));
        powrapper.append(uriAnchor(po.object, 'resource object'));
      }
      message.append(powrapper);
    }
    
    if (predicates_objects.length > 0 && subjects_predicates.length > 0) {
      message.append($('<hr class="my-1"/>'));
    }

    if(subjects_predicates.length > 0) {
      var spwrapper = $('<div/>');
      spwrapper.addClass('cpld-triple-wrapper');
      for (var i = 0; i < subjects_predicates.length; i++) {
        var sp = subjects_predicates[i];
  
        spwrapper.append(uriAnchor(sp.subject, 'resource subject'));
        spwrapper.append(uriAnchor(sp.predicate, 'resource predicate'));
        if (LED_COMPACT_TRIPLES) {
          spwrapper.append(uriDummy("<i>this</i>", 'resource object'));
        } else {
          let shorturi = safeShortURI(uri, (LED_COMPACT_TRIPLES ? LED_ELIPSIS_SOFT : LED_ELIPSIS_HARD));
          spwrapper.append(uriDummy(shorturi, 'resource object'));
        }
      }
    }
    message.append(spwrapper);
    return message;
  } else {
    console.log(`No triples found for ${uri}`);
    return undefined;
  }
}

// Make a toast from the triples containing this URI
// Return nothing if there are no triples
function makeToastForURI(uri) {
  console.log(`Rendering triples for ${uri}`);
  var message = renderTriplesForToast(uri);
  if (message != undefined) {
    var toastId = "toast-" + slugify(uri.uri);
    var uriN3 = safeURI(uri);

    // Remove any old (stale) toasts
    $("#" + toastId).remove();

    // Create a new one
    var header = makeToastHeader(uri.uri, uriN3);
    header.on("click", function () {
      // Scroll to the element
      $("*[resource='" + uri.uri + "']").get(0).scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" }) // Simple bring element into view, no library needed
    });
    var toast = makeToast(toastId, header, message);
    toast.on("mouseover", function () {
      $("*[resource='" + uri.uri + "']").addClass(LED_CSS_BOX); // Mouse in
    }).on("mouseout", function () {
      $("*[resource='" + uri.uri + "']").removeClass(LED_CSS_BOX); // Mouse out
    });

    return toast;
  } else {
    console.log("Returning undefined for toast as no message was rendered");
    return undefined;
  }
}

// --- General Toast Things ---

// Pop up a simple toast for credits
function credits() {
  $("#cpld-credit-toast").remove();
  var header = makeToastHeader("credits", "CPLD Viewer");
  var message = $(`
    <div>
      <p>By <b>Rinke Hoekstra</b> and <b>Andy Townsend</b>.</p>
      <p>Copyright Elsevier B.V. and NISO<br/></p>
      <p><a href="https://github.com/elsevierlabs-os/cpld-viewer">GitHub (Elsevier)</a><p>
      <p><a href="https://github.com/niso-standards/cpld">GitHub (NISO)</a><p>
    </div>`);
  var toast = makeToast("cpld-credit-toast", header, message);
  $("#cpld-toast-panel").prepend(toast);
  $(toast).toast('show');
  $(`#cpld-credit-toast`).get(0).scrollIntoView();  // Make sure our toast can be seen

  setTimeout(() => {
    $("#cpld-credit-toast").toast('hide');
  }, 5000)
}

// --- General toast functions ---

// Prep a toast header
function makeToastHeader(resource, title) {
  var header = $('<div class="toast-header" data-resource="' + resource + '">' +
    '<strong class="mr-auto text-primary">' + title + '</strong>' +
    '<button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="Close">' +
    '<span aria-hidden="true">&times;</span>' +
    '</button>' +
    '</div>');
  return header;
}

// General purpose toast maker
function makeToast(toastId, header, message) {
  var toast = $('<div id="' + toastId + '"class="toast ml-auto" role="alert" data-delay="700" data-autohide="false" aria-live="assertive" aria-atomic="true"></div>');;
  toast.append(header);
  toast.append($('<div class="toast-body"/>').append(message));
  return toast;
}

// --- Reference ---
// Handy docs for handy things used herein
//
// rdflib: https://github.com/solid/solid-tutorial-rdflib.js
// JQuery: https://api.jquery.com/
// CSS
// - Positioning: https://www.w3schools.com/css/css_positioning.asp
// - https://stackoverflow.com/questions/41914954/how-to-force-a-fixed-column-width-with-a-bootstrap-grid-and-keep-the-other-ones
// Bootstrap: https://getbootstrap.com/docs/4.3/getting-started/introduction/
// - https://getbootstrap.com/docs/4.3/layout/overview/
// - https://getbootstrap.com/docs/4.3/layout/grid/
// - https://getbootstrap.com/docs/4.3/components/toasts/
// - https://getbootstrap.com/docs/4.3/components/navbar/
// - https://getbootstrap.com/docs/4.3/components/buttons/
// - https://getbootstrap.com/docs/4.3/utilities/flex/
// - https://getbootstrap.com/docs/4.3/utilities/spacing/
