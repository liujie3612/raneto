var express = require('express'),
    path = require('path'),
    fs = require('fs'),
    favicon = require('static-favicon'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    _s = require('underscore.string'),
    moment = require('moment'),
    marked = require('marked'),
    validator = require('validator'),
    extend = require('extend'),
    raneto = require('raneto-core'),
    config = require('./config'),
    app = express();

// Setup views
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');
app.set('view engine', 'html');
app.enable('view cache');
app.engine('html', require('hogan-express'));

// Setup Express
app.use(favicon(__dirname +'/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Setup config
extend(raneto.config, config);

if (config.authentication === true){
    app.use(require('basic-auth-connect')(config.credentials.username, config.credentials.password));
}

app.post("/rn-edit", function(req, res, next){
    var filePath = path.normalize(raneto.config.content_dir + req.body.file);
    if(!fs.existsSync(filePath)) filePath += '.md';
    fs.writeFile(filePath, req.body.content, function(err) {
        if(err) {
            console.log(err);
            res.json({
                status: 1,
                message: err
            });
            return;
        }

        res.json({
            status: 0,
            message: "Page Saved"
        });
    }); 
});
app.post("/rn-delete", function(req, res, next){  
    var filePath = path.normalize(raneto.config.content_dir + req.body.file);
    if(!fs.existsSync(filePath)) filePath += '.md';
    fs.rename(filePath, filePath + ".del", function(err) {
        if(err) {
            console.log(err);
            res.json({
                status: 1,
                message: err
            });
            return;
        }

        res.json({
            status: 0,
            message: "Page Deleted"
        });
    }); 
});
app.post("/rn-add-category", function(req, res, next){
    var filePath = path.normalize(raneto.config.content_dir + req.body.category);
    fs.mkdir(filePath, function(err) {
        if(err) {
            console.log(err);
            res.json({
                status: 1,
                message: err
            });
            return;
        }

        res.json({
            status: 0,
            message: "Category Created"
        });
    }); 
});
app.post("/rn-add-page", function(req, res, next){
    var filePath = path.normalize(raneto.config.content_dir + req.body.category + "/" + req.body.name + ".md");
    fs.open(filePath, "a", function(err, fd) {
        
        fs.close(fd);
        if(err) {
            console.log(err);
            res.json({
                status: 1,
                message: err
            });
            return;
        }

        res.json({
            status: 0,
            message: "Page Created"
        });
    }); 

});

// Handle all requests
app.get('*', function(req, res, next) {
    var suffix = "\edit";
    if(req.query.search){
        var searchQuery = validator.toString(validator.escape(_s.stripTags(req.query.search))).trim(),
            searchResults = raneto.doSearch(searchQuery),
            pageListSearch = raneto.getPages('');

        return res.render('search', {
            config: config,
            pages: pageListSearch,
            search: searchQuery,
            searchResults: searchResults,
            body_class: 'page-search'
        });
    }
    else if(req.params[0]){
        var slug = req.params[0];
        if(slug == '/') slug = '/index';

        var pageList = raneto.getPages(slug),
            filePath = path.normalize(raneto.config.content_dir + slug),
            filePathOrig = filePath;
            
        if(filePath.indexOf(suffix, filePath.length - suffix.length) !== -1){
            filePath = filePath.slice(0, - suffix.length - 1);
        }
        if(!fs.existsSync(filePath)) filePath += '.md';

        if(slug == '/index' && !fs.existsSync(filePath)){
            var stat = fs.lstatSync('./views/home.html');
            return res.render('home', {
                config: config,
                pages: pageList,
                body_class: 'page-home',
                last_modified: moment(stat.mtime).format('Do MMM YYYY')
            });
        } else {

            if(filePathOrig.indexOf(suffix, filePathOrig.length - suffix.length) !== -1){
               
                 fs.readFile(filePath, 'utf8', function(err, content) {
                    if(err){
                        err.status = '404';
                        err.message = 'Whoops. Looks like this page doesn\'t exist.';
                        return next(err);
                    }
                    if(path.extname(filePath) == '.md'){
                        // File info
                        var stat = fs.lstatSync(filePath);
                        // Meta
                        var meta = raneto.processMeta(content);
                        content = raneto.stripMeta(content);
                        if(!meta.title) meta.title = raneto.slugToTitle(filePath);
                        // Content
                        content = raneto.processVars(content);
                        var html = content;
                        var template = meta.template || 'page';

                        return res.render('edit', {
                            config: config,
                            pages: pageList,
                            meta: meta,
                            content: html,
                            body_class: template + '-' + raneto.cleanString(slug),
                            last_modified: moment(stat.mtime).format('Do MMM YYYY')
                        });
                    }
                 });
            } else {
                fs.readFile(filePath, 'utf8', function(err, content) {
                    if(err){
                        err.status = '404';
                        err.message = 'Whoops. Looks like this page doesn\'t exist.';
                        return next(err);
                    }

                    // Process Markdown files
                    if(path.extname(filePath) == '.md'){
                        // File info
                        var stat = fs.lstatSync(filePath);
                        // Meta
                        var meta = raneto.processMeta(content);
                        content = raneto.stripMeta(content);
                        if(!meta.title) meta.title = raneto.slugToTitle(filePath);
                        // Content
                        content = raneto.processVars(content);
                        // BEGIN: DISPLAY, NOT EDIT
                        marked.setOptions({
                          langPrefix: ''
                        });
                        var html = marked(content);
                        // END: DISPLAY, NOT EDIT
                        var template = meta.template || 'page';

                        return res.render(template, {
                            config: config,
                            pages: pageList,
                            meta: meta,
                            content: html,
                            body_class: template + '-' + raneto.cleanString(slug),
                            last_modified: moment(stat.mtime).format('Do MMM YYYY')
                        });
                    } else {
                        // Serve static file
                        res.sendfile(filePath);
                    }
                });
            }
        }
    } else {
        next();
    }
});

// Handle any errors
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        config: config,
        status: err.status,
        message: err.message,
        error: {},
        body_class: 'page-error'
    });
});

module.exports = app;
