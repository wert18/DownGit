var downGitModule = angular.module('downGitModule', [
]);

downGitModule.factory('downGitService', [
    '$http',
    '$q',

    function ($http, $q) {
        var repoInfo = {};

        var parseInfo = function(parameters) {
            var repoPath = new URL(parameters.url).pathname;
            var splitPath = repoPath.split("/");
            var info = {};

            info.author = splitPath[1];
            info.repository = splitPath[2];
            info.branch = splitPath[4] || "main"; // Default to main branch if not specified

            info.rootName = splitPath[splitPath.length-1];
            if(!!splitPath[4]){
                info.resPath = repoPath.substring(
                    repoPath.indexOf(splitPath[4])+splitPath[4].length+1
                );
            }
            
            // Use raw GitHub content URL instead of API
            info.urlPrefix = "https://raw.githubusercontent.com/"+
                info.author+"/"+info.repository+"/"+info.branch+"/";
            info.apiUrlPrefix = "https://api.github.com/repos/"+
                info.author+"/"+info.repository+"/contents/";
            info.apiUrlPostfix = "?ref="+info.branch;

            if(!parameters.fileName || parameters.fileName==""){
                info.downloadFileName = info.rootName;
            } else{
                info.downloadFileName = parameters.fileName;
            }

            if(parameters.rootDirectory=="false"){
                info.rootDirectoryName = "";
            } else if(!parameters.rootDirectory || parameters.rootDirectory=="" ||
                parameters.rootDirectory=="true"){
                info.rootDirectoryName = info.rootName+"/";
            } else{
                info.rootDirectoryName = parameters.rootDirectory+"/";
            }

            return info;
        }

        var downloadDir = function(progress){
            progress.isProcessing.val = true;

            var dirPaths = [];
            var files = [];
            var requestedPromises = [];

            dirPaths.push(repoInfo.resPath);
            mapFileAndDirectory(dirPaths, files, requestedPromises, progress);
        }

        var mapFileAndDirectory = function(dirPaths, files, requestedPromises, progress){
            $http.get(repoInfo.apiUrlPrefix+dirPaths.pop()+repoInfo.apiUrlPostfix).then(function(response) {
                for(var i=response.data.length-1; i>=0; i--){
                    if(response.data[i].type=="dir"){
                        dirPaths.push(response.data[i].path);
                    } else{
                        if(response.data[i].download_url){
                            getFile(response.data[i].path,
                                response.data[i].download_url,
                                files, requestedPromises, progress
                            );
                        } else {
                            console.log(response.data[i]);
                        }
                    }
                }

                if(dirPaths.length<=0){
                    downloadFiles(files, requestedPromises, progress);
                } else{
                    mapFileAndDirectory(dirPaths, files, requestedPromises, progress);
                }
            }).catch(function(error) {
                console.error("Error fetching directory:", error);
                progress.isProcessing.val = false;
                toastr.error("Error accessing GitHub repository. Please check if the repository is public and accessible.");
            });
        }

        var downloadFiles = function(files, requestedPromises, progress){
            var zip = new JSZip();
            $q.all(requestedPromises).then(function(data) {
                for(var i=files.length-1; i>=0; i--){
                    zip.file(
                        repoInfo.rootDirectoryName+files[i].path.substring(decodeURI(repoInfo.resPath).length+1),
                        files[i].data
                    );
                }

                progress.isProcessing.val=false;
                zip.generateAsync({type:"blob"}).then(function(content) {
                    saveAs(content, repoInfo.downloadFileName+".zip");
                });
            }).catch(function(error) {
                console.error("Error creating zip:", error);
                progress.isProcessing.val = false;
                toastr.error("Error creating download file. Please try again.");
            });
        }

        var getFile = function (path, url, files, requestedPromises, progress) {
            var promise = $http.get(url, {responseType: "arraybuffer"}).then(function (file) {
                files.push({path:path, data:file.data});
                progress.downloadedFiles.val = files.length;
            }).catch(function(error) {
                console.error("Error downloading file:", error);
                // Try alternative URL if API fails
                var altUrl = repoInfo.urlPrefix + path;
                return $http.get(altUrl, {responseType: "arraybuffer"}).then(function (file) {
                    files.push({path:path, data:file.data});
                    progress.downloadedFiles.val = files.length;
                });
            });

            requestedPromises.push(promise);
            progress.totalFiles.val = requestedPromises.length;
        }

        var downloadFile = function (url, progress, toastr) {
            progress.isProcessing.val=true;
            progress.downloadedFiles.val = 0;
            progress.totalFiles.val = 1;

            var zip = new JSZip();
            $http.get(url, {responseType: "arraybuffer"}).then(function (file) {
                progress.downloadedFiles.val = 1;
                zip.file(repoInfo.rootName, file.data);

                progress.isProcessing.val=false;
                zip.generateAsync({type:"blob"}).then(function(content) {
                    saveAs(content, repoInfo.downloadFileName+".zip");
                });
            }).catch(function(error) {
                console.error("Error downloading file:", error);
                // Try alternative URL if API fails
                var altUrl = repoInfo.urlPrefix + repoInfo.resPath;
                $http.get(altUrl, {responseType: "arraybuffer"}).then(function (file) {
                    progress.downloadedFiles.val = 1;
                    zip.file(repoInfo.rootName, file.data);

                    progress.isProcessing.val=false;
                    zip.generateAsync({type:"blob"}).then(function(content) {
                        saveAs(content, repoInfo.downloadFileName+".zip");
                    });
                }).catch(function(error) {
                    console.error("Error downloading file:", error);
                    progress.isProcessing.val=false;
                    toastr.error("Error downloading file. Please check if the repository is public and accessible.");
                });
            });
        }

        return {
            downloadZippedFiles: function(parameters, progress, toastr) {
                repoInfo = parseInfo(parameters);

                if(!repoInfo.resPath || repoInfo.resPath==""){
                    if(!repoInfo.branch || repoInfo.branch==""){
                        repoInfo.branch="main";
                    }

                    var downloadUrl = "https://github.com/"+repoInfo.author+"/"+
                        repoInfo.repository+"/archive/"+repoInfo.branch+".zip";

                    window.location = downloadUrl;
                } else {
                    $http.get(repoInfo.apiUrlPrefix+repoInfo.resPath+repoInfo.apiUrlPostfix).then(function(response) {
                        if(response.data instanceof Array){
                            downloadDir(progress);
                        } else {
                            downloadFile(response.data.download_url, progress, toastr);
                        }
                    }).catch(function(error) {
                        console.error("Error accessing repository:", error);
                        // Try direct download if API fails
                        downloadFile("https://raw.githubusercontent.com/"+repoInfo.author+"/"+
                                repoInfo.repository+"/"+repoInfo.branch+"/"+repoInfo.resPath,
                                progress, toastr);
                    });
                }
            },
        };
    }
]);
