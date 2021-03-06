﻿(function () {

    "use strict";

    angular
        .module("incomeMgmt.pimsGrid")
        .controller("pimsGridCtrl", pimsGridCtrl);

    pimsGridCtrl.$inject = ['uiGridConstants', '$modal', '$location',
                            'queriesIncomeSvc', 'activitySummarySvc', 'pimsGridColumnSvc',
                            'queriesProfileProjectionSvc', '$state', 'positionCreateSvc',
                            'queriesPositionsSvc','queriesAssetSvc', '$stateParams'];
    
    
    /* Customization considerations/parameters for upcoming gridDirective, per documentation:
       TODO: Sorting:  Sorting can be disabled at the column level by setting 'enableSorting: false' in the column def. 
                       EX: columnDefs: [  { field: 'company', enableSorting: false } }
       TODO: Filtering:  Filtering can be disabled at the column level by setting enableFiltering: false in the column def
       TODO: Footer:  Grid-footer set to always display; column-footer remains an option for customization if desired later
       TODO: Columns:  You can dynamically add and remove columns; you can dynamically change the display name on a column (along with some other column def properties
       TODO: Editing: The ui.grid.edit feature allows inline editing of grid data. To enable, you must include the 'ui.grid.edit' module and you must include the ui-grid-edit directive on your grid element
                       To be determined if we want 'editing' to be a dynamic feature?
       TODO: Data Importing - ** a feature to consider at a later time. **
    */

    function pimsGridCtrl(uiGridConstants, $modal, $location, queriesIncomeSvc, activitySummarySvc, pimsGridColumnSvc, queriesProfileProjectionSvc, $state, positionCreateSvc, queriesPositionsSvc, queriesAssetSvc, $stateParams) {
        
        var vm = this;
        // Contexts based on current routing 'state' & their URLs.
        var currentContext = getCurrentContextFromUrl($location.$$url);
        var isValidCapitalEntry = false;
        var editedAssetTypes = [];
        var today = new Date();
        var initializedColDefs = [];

        vm.gridTitle = "";
        vm.showRefreshBtn = false;
        vm.showToggle = true;
        vm.showProfilesBtn = false;
        vm.showRefreshGridBtn = true;
        vm.showProjectionsBtn = false;
        vm.disableProfilesBtn = true;
        vm.disableProjectionsBtn = true;
        vm.isUnInitializedProfileProjection = false;
        vm.isProfileOnlyRequest = true;
        vm.enteredGridTickersCapital = [];
        vm.gridOptions = {
            enableFiltering: false,
            enableCellEdit: false, 
            enableGridMenu: true,
            showGridFooter: true, 
            showColumnFooter: true,
            //enableSelectAll: true,
            exporterCsvFilename: 'testGridDataFile.csv',
            exporterMenuPdf: false, // for possible future use.
            // 'data' MUST be initialized for filtering to work--at this time. Bug or async call & grid display, design timing issue? Revisit ?
            data: [{ ".": "." }],
            onRegisterApi: function(gridApi) {
                vm.gridApi = gridApi;

                gridApi.edit.on.afterCellEdit(null,
                    function(rowEntity, colDef, newValue, oldValue) {
                        if (colDef.name === 'ticker') {
                            vm.disableProfilesBtn =
                                queriesProfileProjectionSvc.isValidTickerOrCapitalEdit(colDef.name, newValue);
                        }
                        if (colDef.name == 'capital') {
                            isValidCapitalEntry =
                                queriesProfileProjectionSvc.isValidTickerOrCapitalEdit(colDef.name, newValue);
                        }
                        if (colDef.name === 'divRate') {
                            if (isNaN(newValue)) {
                                alert("Invalid entry; dividend rate must be greater than 0");
                                rowEntity.divRate = oldValue != "0" ? "0" : oldValue;
                                // TODO: Deferred - reset focus to 'divRate' cell. Not working. We'll validate upon 'Projection(s)' click event for now.
                                //gridApi.cellNav.scrollToFocus(vm.gridOptions.data[0], vm.gridOptions.columnDefs[3]);
                            }
                            // Enable 'Projection(s)' button only if capital & dividend rate entries are ok.
                            if (isValidCapitalEntry)
                                vm.disableProjectionsBtn = false;

                        }
                    });
                // Revenue Edit.
                if (currentContext === "RE") {
                    vm.gridOptions.multiSelect = false;
                    gridApi.selection.on.rowSelectionChanged(null,
                        function(row) {
                            var revenueSelected = {
                                TickerSymbol: row.entity.ticker,
                                AcctType: row.entity.accountType,
                                Revenue: row.entity.amountReceived,
                                RevenueDate: row.entity.dateReceived,
                                RevenuePositionId: row.entity.revenuePositionId,
                                RevenueId: row.entity.revenueId
                            }
                            $state.go("income_edit", { revenueSelectionObj: revenueSelected });
                        });
                }
                // Position(s) Edit.
                if (currentContext === "P") {
                    vm.gridOptions.multiSelect = false;
                    gridApi.selection.on.rowSelectionChanged(null,
                        function(row) {
                            // Row data columns used for mapping defined via 
                            // WebApi call from positionCreateSvc.getPositionsForTicker().
                            var positionSelected = {
                                TickerSymbol: row.entity.referencedTickerSymbol,
                                AcctType: row.entity.preEditPositionAccount,
                                Qty: row.entity.qty,
                                UnitCost: row.entity.unitCost,
                                PurchDate: row.entity.dateOfPurchase,
                                PositionAddDate: row.entity.datePositionAdded,
                                LastUpdate: row.entity.lastUpdate,
                                PositionId: row.entity.positionId
                            }
                            $state.go("position_edit", { positionSelectionObj: positionSelected });
                        });
                }
                // ----- Asset Summary - asset type edit(s), e.g., common stock -> preferred stock, - **DEFERRED** !
                //if (currentContext === "AA") {
                //    gridApi.edit.on.afterCellEdit(null, function(rowEntity, colDef, newValue, oldValue) {
                //        var editedItem = queriesAssetSvc.getAssetTypeEditsVm();
                //        editedItem.tickerSymbol = rowEntity.tickerSymbol.trim();
                //        editedItem.assetClassId = getKeyIdForAssetType(newValue.trim());
                //        editedItem.lastUpdate = (today.getMonth() + 1) + "/" + today.getDate() + "/" + today.getFullYear();
                //        editedItem.profileId = rowEntity.profileId;
                //        editedItem.investorId = rowEntity.investorId;
                //        editedItem.assetId = rowEntity.assetId;

                //        editedAssetTypes.push(editedItem);
                //    });

                //};

            } // end function(gridApi)
        };


        vm.availableAssetTypes = [];
        vm.investorAssetsSummary = [];
        vm.revenueResults = [];
        vm.positionResults = [];
        vm.activitySummaryResults = [];
        
        var modalCriteriaInstance = {};
        var queryResults = [];
        var queryResultKeys = [];
       
        // Available generic grid heading message container when needed.
        vm.showMsg = false;

        switch (currentContext) {
            case "AS": // Ok 5.16.18
                vm.showToggle = false;
                vm.gridTitle = "YTD Income Activity Summary for  " + today.getFullYear();
                activitySummarySvc.query(function (responseData) {
                    vm.activitySummaryResults = responseData;
                    buildGridColKeys();
                    initializedColDefs = pimsGridColumnSvc.initializeActivitySummaryColDefs(queryResultKeys);
                    if (initializedColDefs.length > 0 && vm.activitySummaryResults.length > 0) {
                        vm.gridOptions.columnDefs = initializedColDefs;
                        vm.gridOptions.data = vm.activitySummaryResults;
                    }
                }, function(err) {
                    alert("Unable to fetch Activity Summary data for YTD " + today.getFullYear() +  " due to : \n" + err.data.message);
                    $state.go("home");
                });
                break;
            case "R1":
            case "R2":
            case "R3":
            case "R4":
            case "R5":
            case "R6":
            case "RE":
            case "P":  // 5.22.18 - this case needed ?
                if ($location.$$port === 5969) {
                    // VS IDE runtime
                    vm.templatePath = $location.$$protocol +
                        "://" + $location.$$host +
                        ":" + $location.$$port +
                        "/app/Queries/Criteria.Dialog/criteriaView.html";
                } else {
                    // Browser runtime via virtual directory. 
                    // TODO: should not rely on hardcoded localhost.
                    vm.templatePath = 'http://localhost/Pims.Client/App/Queries/Criteria.Dialog/criteriaView.html';
                }
                vm.criteriaEntries = queriesIncomeSvc.buildCriteriaEntries();
                open(); 
                // Reorder columns manually, despite attempt via WebApi: GetAssetRevenueHistoryByDatesWithAcctTypes().
                if (currentContext === "RE") {
                    queryResultKeys[0] = "ticker";
                    queryResultKeys[1] = "accountType";
                    queryResultKeys[2] = "dateReceived";
                    queryResultKeys[3] = "amountReceived";
                    queryResultKeys[4] = "revenuePositionId"; 
                    queryResultKeys[5] = "revenueId";        
                }
                // Grid column defintions and initializations handled post asynchronously via vm.initializeGrid().
                break;
            case "PP":
                vm.showProfilesBtn = true;
                vm.showProjectionsBtn = true;
                vm.showToggle = false;
                vm.gridTitle = "Asset Profiles - Projections  [ max: 5 ];  note tooltips for rate & frequency";
                vm.isUnInitializedProfileProjection = true;
                queryResultKeys = ["ticker", "capital", "price", "divRate",  "divFreq", "divYield", "divDate", "projectedRevenue"];
                initializedColDefs = pimsGridColumnSvc.initializeProfileProjectionColDefs(queryResultKeys);
                if (initializedColDefs.length > 0) {
                    vm.gridOptions.columnDefs = initializedColDefs;
                    vm.gridOptions.data = [
                        { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
                        { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
                        { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
                        { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
                        { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" }];
                }
                break;
            case "PO":
            case "AA":
                vm.gridTitle = " Portfolio asset summary for - "  + today.toDateString();
                vm.showMsg = true;
                vm.gridMsg = ""; // any message can go here";
                queriesAssetSvc.getAssetSummaryData($stateParams.status, vm);
                break;
            //case "P":
                // TODO: to be implemented if necessary
           //     break;


            // Asset summary results via 'Queries' menu.
           
            // ** 5.10.2018 - Combined above to provide 2 access pts for this functionality. **
            //case "PO":
            //    vm.gridTitle = " Portfolio Position Summary for " + today.toDateString();
            //    vm.showMsg = true;
            //    vm.gridMsg = " *Note - Valuation & Gain/Loss figures are approximations only.";
            //    queriesPositionsSvc.query(function(results) {
            //        queryResults = results;
            //        buildGridColKeys();
            //    });
            //    break;
            //// Asset summary results via 'Queries' menu.
            //case "AA":
            //    vm.gridTitle = " Portfolio asset summary"; // -  Double click any 'Asset Type' to invoke drop down choices ";
            //    queriesAssetSvc.getAssetSummaryData($stateParams.status, vm);
            //    break;
        }


        vm.toggleFiltering = function () {
            vm.gridOptions.enableFiltering = !vm.gridOptions.enableFiltering;
            vm.gridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
        };



       
        function getCurrentContextFromUrl(currentPath) {
            var builtContext = "";

            // currentPath ex: "/grid/AA/I"
            for (var i = 6; i < currentPath.length; i++) {
                if (currentPath[i] == '/') {
                    break;
                }

                builtContext += currentPath[i];
            };
            return builtContext;
        }
        

        // Modal dialog for entered query criteria.
        function open() {
            modalCriteriaInstance = $modal.open({
                templateUrl: vm.templatePath,
                controller: "criteriaCtrl",
                size: "md",
                // Members that will be resolved & PASSED to criteriaCtrl
                // (via injection), as locals (of type object).
                resolve: {
                    queryCriteria: function () {
                        return vm.criteriaEntries;
                    }
                }
            });

            // Promise
            modalCriteriaInstance.result.then(
                // Success
                function (criteriaData) {
                    switch (criteriaData[1].Group) {
                        case "R1":
                        case "R2":
                        case "R3":
                        case "R4":
                        case "R5":
                        case "R6":
                        case "RE":
                            criteriaData[0].Value_1 = queriesIncomeSvc.formatUrlDate(criteriaData[0].Value_1);
                            criteriaData[0].Value_2 = queriesIncomeSvc.formatUrlDate(criteriaData[0].Value_2);
                            vm.enteredCriteria = criteriaData;
                            queriesIncomeSvc.getRevenue($location.$$path, vm.enteredCriteria, vm);
                            break;
                        case "P":
                           positionCreateSvc.getPositionsForTicker(criteriaData[0].Value_3.toUpperCase().trim(), vm);
                           break;
                    }
                },
                function (ex) {
                    if (ex !== "cancel")
                        alert("Missing, or error processing query criteria.");
                });
        };
        
        
        // Post-async from : getRevenue() query processing.
        vm.initializeGrid = function () {
            queryResults = queriesIncomeSvc.getQueryResults(); // includes revenuePositionId
            vm.gridTitle = queriesIncomeSvc.getQuerySelection();
            buildGridColKeys(); 
            initializedColDefs = pimsGridColumnSvc.initializeRevenueColDefs(queryResultKeys, currentContext);
            vm.gridOptions.columnDefs = initializedColDefs;
            vm.gridOptions.data = queryResults;  //Bug ? -  Disables filtering 
        }


        // Post-async getPositionsForTicker() processing.
        vm.initializePositionsGrid = function (responsePositions) {
            queryResults = responsePositions;
            // Make all ticker Position(s) available for possible Position (account type) editing.
            positionCreateSvc.setInvestorMatchingAccounts(queryResults);
            vm.gridTitle = vm.criteriaEntries[3].Description2.trim();
            vm.positionResults = responsePositions;
            buildGridColKeys();
            initializedColDefs = pimsGridColumnSvc.initializePositionEditColDefs(queryResultKeys);
            if (initializedColDefs.length > 0) {
                vm.gridOptions.columnDefs = initializedColDefs;
                vm.gridOptions.data = vm.positionResults;
            }
        }


        vm.postAsyncInitializeProfileProjectionGrid = function(initializedProfiles) {
            vm.gridOptions.data = initializedProfiles;
            vm.disableProfilesBtn = true;
            vm.disableProjectionsBtn = true;
        }


        vm.postAsyncGetAvailableAssetTypes = function (fetchedAssetTypes) {
            vm.availableAssetTypes = fetchedAssetTypes;
            buildGridColKeys();
            initializedColDefs = pimsGridColumnSvc.initializeAssetSummaryColDefs(queryResultKeys, vm.availableAssetTypes);
            vm.gridOptions.columnDefs = initializedColDefs;
            vm.gridOptions.data = vm.investorAssetsSummary;
        }


        vm.postAsyncGetAssetSummaryData = function (initializedSummary) {
            vm.investorAssetsSummary = initializedSummary;
            queriesAssetSvc.getAvailableAssetTypes(vm);
            vm.showRefreshBtn = true;
            vm.showRefreshGridBtn = false;
        }


        vm.postAsyncAssetTypeUpdates = function(response) {
            alert("Completed asset type update(s)");
        }
        

        function buildGridColKeys() {
            // Template ref for columnDefs: [  { field: 'revenueMonth', headerCellClass: 'myGridHeaders' }, ...]
            if (currentContext.indexOf("R") === 0) {
                if (vm.revenueResults.length > 0) {
                    queryResultKeys = Object.keys(vm.revenueResults[0]).toString().split(",");
                }
            }
            else
            {
                if (currentContext === "P") {
                    queryResultKeys = Object.keys(vm.positionResults[0]).toString().split(","); // column headers
                } else {
                    if (currentContext === "AS") {
                        queryResultKeys = Object.keys(vm.activitySummaryResults[0]).toString().split(","); 
                    } else {
                        if (currentContext !== "PP" && currentContext !== "AA") {
                            if (vm.investorAssetsSummary.length > 0) {
                                queryResultKeys = Object.keys(vm.investorAssetsSummary[0]).toString().split(",");
                            }
                         } else {
                            if (currentContext === "AA")
                                queryResultKeys = Object.keys(vm.investorAssetsSummary[0]).toString().split(","); 

                            //if (currentContext === "PP")
                            //    queryResultKeys = Object.keys(vm.investorAssetsSummary[0]).toString().split(","); 
                        }
                    }   
                }
            } 
        } 
           
            
       
            
        // TODO: 5.16.18 - consolidate with above switch statement on line 152 ?
        //switch(currentContext) {
        //    case "AS":
        //        initializedColDefs = pimsGridColumnSvc.initializeActivitySummaryColDefs(queryResultKeys);
        //        break;
        //    case "R1":  
        //    case "R2":
        //    case "R3":
        //    case "R4":
        //    case "R5":
        //    case "R6":
        //    case "RE":
        //        // Reorder columns manually, despite attempt via WebApi: GetAssetRevenueHistoryByDatesWithAcctTypes().
        //        if (currentContext === "RE") {
        //            queryResultKeys[0] = "ticker";
        //            queryResultKeys[1] = "accountType";
        //            queryResultKeys[2] = "dateReceived";
        //            queryResultKeys[3] = "amountReceived";
        //            queryResultKeys[4] = "revenuePositionId"; 
        //            queryResultKeys[5] = "revenueId";        
        //        }
        //        initializedColDefs = pimsGridColumnSvc.initializeRevenueColDefs(queryResultKeys, currentContext);
        //        break;
        //    case "PP":
        //        if (vm.isUnInitializedProfileProjection) {
        //            queryResultKeys = ["ticker", "capital", "price", "divRate",  "divFreq", "divYield", "divDate", "projectedRevenue"];
        //            initializedColDefs = pimsGridColumnSvc.initializeProfileProjectionColDefs(queryResultKeys);
        //            vm.gridOptions.data = [
        //                { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
        //                { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
        //                { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
        //                { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" },
        //                { ticker: "Enter ticker", capital: "(optional)", divRate: "0", divFreq: "A,S,Q,M" }];
        //        } 
        //        break;
        //    case "P":
        //        queryResultKeys[0] = "referencedTickerSymbol";
        //        queryResultKeys[1] = "preEditPositionAccount";
        //        queryResultKeys[2] = "qty";
        //        queryResultKeys[3] = "unitCost";
        //        queryResultKeys[4] = "dateOfPurchase"; 
        //        queryResultKeys[5] = "datePositionAdded";
        //        queryResultKeys[6] = "lastUpdate";
        //        queryResultKeys[7] = "positionId";

        //        initializedColDefs = pimsGridColumnSvc.initializePositionEditColDefs(queryResultKeys);
        //        break;
        //    case "PO":  // POsition summary
        //        queryResultKeys[0] = "positionSummaryTickerSymbol";
        //        queryResultKeys[1] = "positionSummaryAccountType";
        //        queryResultKeys[2] = "positionSummaryQty";
        //        queryResultKeys[3] = "positionSummaryValuation";
        //        queryResultKeys[4] = "positionSummaryGainLoss";

        //        initializedColDefs = pimsGridColumnSvc.initializePositionSummaryColDefs(queryResultKeys);
        //        break;
        //    case "AA":
        //        queryResultKeys[0] = "tickerSymbol";
        //        queryResultKeys[1] = "tickerDescription";
        //        queryResultKeys[2] = "assetClassification";
        //        queryResultKeys[3] = "distFreq";

        //        initializedColDefs = pimsGridColumnSvc.initializeAssetSummaryColDefs(queryResultKeys, vm.availableAssetTypes);
        //        break; 
        //    }

        /* TODO: 5.16.18 - incorporate into refactored code
            vm.gridOptions.columnDefs = initializedColDefs;
            if (currentContext === "R1") {
                //vm.revenueResults[0].revenueAmount = queriesIncomeSvc.formatCurrency(vm.revenueResults[0].revenueAmount); // added 5.11.18
                //queryResults[0].revenueAmount = queriesIncomeSvc.formatCurrency(queryResults[0].revenueAmount);
            }

            if (!vm.isUnInitializedProfileProjection && vm.investorAssetsSummary.length > 0 )
                vm.gridOptions.data = vm.investorAssetsSummary;


            if (currentContext === "AS")
                vm.gridOptions.data = vm.activitySummaryResults;


            vm.toggleFiltering = function () {
                vm.gridOptions.enableFiltering = !vm.gridOptions.enableFiltering;
                vm.gridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
            };
    */



        // 'Profiles - Projections' button event handler.
        vm.InitializeProfileProjectionGrid = function (includeProjections, gridData) {

            //var divFreqExpr = new RegExp("[ASQM]", "g");
            for (var row = 0; row < 5; row++) {
                //var resultDivFreq = gridData.grid.rows[row].entity.divFreq.match(divFreqExpr);
                var enteredFreq = gridData.grid.rows[row].entity.divFreq.toUpperCase();
                if (enteredFreq !== "A" && enteredFreq !== "S" && enteredFreq !== "Q" && enteredFreq !== "M" && gridData.grid.rows[row].entity.ticker !== "Enter ticker")
                    alert("Invalid distribution frequency found for: \n" + gridData.grid.rows[row].entity.ticker);

                if (gridData.grid.rows[row].entity.capital > 0 ) {
                    var tickerAndCapital = {
                                                tickerSymbol: gridData.grid.rows[row].entity.ticker,
                                                dividendRateInput: gridData.grid.rows[row].entity.divRate !== "0"
                                                    ? gridData.grid.rows[row].entity.divRate
                                                    : "0",
                                                capitalToInvest: includeProjections === true
                                                    ? gridData.grid.rows[row].entity.capital
                                                    : 0,
                                                divFreq: gridData.grid.rows[row].entity.divFreq
                    };
                    vm.enteredGridTickersCapital.push(tickerAndCapital);
                } 
            }

           queriesProfileProjectionSvc.getProfiles(vm.enteredGridTickersCapital, vm);
        }


        vm.postAsyncInitializeProfileProjectionGrid = function(initializedProfiles) {
            vm.gridOptions.data = initializedProfiles;
            vm.disableProfilesBtn = true;
            vm.disableProjectionsBtn = true;
        }


        vm.refreshGrid = function () {
            // Also clears browser cache ?
            location.reload(true);
        }


        // TODO: Duplicate found in positionEditDeleteCtrl; consolidate into service?
        vm.clearPosition = function () {
            var backlen = history.length;
            history.go(-backlen);
            window.location.href = "http://localhost:5969/App/Layout/Main.html#/grid/P";

        }


        vm.updateAssetTypes = function() {

            // **********
            // CANCELLED functionality - unable to avoid NH deleting ALL associated
            // Position records when editing an Asset records' asset type. Functionality
            // to be re-assesed upon adoption of ASPNET.CORE via VS2017.
            // *********

            //if (editedAssetTypes.length > 1) {
            //    sortByAssetId();
            //    editedAssetTypes = removeDuplicateAssetIds(editedAssetTypes);
            //}
            
            //queriesAssetSvc.updateAssetTypes(editedAssetTypes, vm);
        }



        // TODO: To be tested, if functionality needed
        function sortByAssetId() {
            editedAssetTypes.sort(function (obj1, obj2) {
                    var assetA = obj1.assetId; 
                    var assetB = obj2.assetId; 
                    if (assetA < assetB) {
                        return -1;
                    }
                    if (assetA > assetB) {
                        return 1;
                    }

                    return 0;
                });
                return editedAssetTypes;
        }


        // TODO: To be tested, if functionality needed
        function removeDuplicateAssetIds(data) {
            for (var i = 0; i < data.length; i++) {
                if (data[i].assetId === data[i - 1].assetId)
                    data.splice(i, 1);
            }
            return data;
        }


       









        } // pimsGridCtrl
        
    /* old code to delete
        //function getKeyIdForAssetType(assetTypeToSearch) {

        //    var matchedAssetTypeId = 0;
        //    for (var i = 0; i < vm.availableAssetTypes.length; i++) {
        //        if (vm.availableAssetTypes[i].description.trim() === assetTypeToSearch.trim()) {
        //            matchedAssetTypeId = vm.availableAssetTypes[i].keyId;
        //            break;
        //        }
        //    }

        //    return matchedAssetTypeId;
        //}
        

        //vm.toggleFiltering = function () {
        //    vm.gridOptions.enableFiltering = !vm.gridOptions.enableFiltering;
        //    vm.gridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
        //};


        //// 'Profiles', 'Projections' button event handler.
        //vm.InitializeProfileProjectionGrid = function (includeProjections, gridData) {

        //    var divFreqExpr = new RegExp("[ASQM]", "g");
        //    for (var row = 0; row < 5; row++) {
        //        var isValidDivFreq = gridData.grid.rows[row].entity.divFreq.match(divFreqExpr);

        //        if (gridData.grid.rows[row].entity.ticker !== "Enter ticker" && gridData.grid.rows[row].entity.capital > 0 && isValidDivFreq !== null) {
        //            var tickerAndCapital = {
        //                tickerSymbol: gridData.grid.rows[row].entity.ticker,
        //                dividendRateInput: gridData.grid.rows[row].entity.divRate !== "0"
        //                    ? gridData.grid.rows[row].entity.divRate
        //                    : "0",
        //                capitalToInvest: includeProjections === true
        //                    ? gridData.grid.rows[row].entity.capital
        //                    : 0,
        //                divFreq: gridData.grid.rows[row].entity.divFreq
        //            };

        //            vm.enteredGridTickersCapital.push(tickerAndCapital);
        //        } 
                   
        //    }

        //   queriesProfileProjectionSvc.getProfiles(vm.enteredGridTickersCapital, vm);
        //}


        //vm.postAsyncInitializeProfileProjectionGrid = function(initializedProfiles) {
        //    vm.gridOptions.data = initializedProfiles;
        //    vm.disableProfilesBtn = true;
        //    vm.disableProjectionsBtn = true;
        //}
        


        //vm.refreshGrid = function () {
        //    // Also clears browser cache ?
        //    location.reload(true);
        //}


        //// TODO: Duplicate found in positionEditDeleteCtrl; consolidate into service?
        //vm.clearPosition = function () {
        //    var backlen = history.length;
        //    history.go(-backlen);
        //    window.location.href = "http://localhost:5969/App/Layout/Main.html#/grid/P";

        //}


        //vm.updateAssetTypes = function() {

        //    // **********
        //    // CANCELLED functionality - unable to avoid NH deleting ALL associated
        //    // Position records when editing an Asset records' asset type. Functionality
        //    // to be re-assesed upon adoption of ASPNET.CORE via VS2017.
        //    // *********

        //    //if (editedAssetTypes.length > 1) {
        //    //    sortByAssetId();
        //    //    editedAssetTypes = removeDuplicateAssetIds(editedAssetTypes);
        //    //}
            
        //    //queriesAssetSvc.updateAssetTypes(editedAssetTypes, vm);
        //}


        //vm.postAsyncAssetTypeUpdates = function(response) {
        //    alert("Completed asset type update(s)");
        //}

        //// TODO: To be tested, if functionality needed
        //function sortByAssetId() {
        //    editedAssetTypes.sort(function (obj1, obj2) {
        //            var assetA = obj1.assetId; 
        //            var assetB = obj2.assetId; 
        //            if (assetA < assetB) {
        //                return -1;
        //            }
        //            if (assetA > assetB) {
        //                return 1;
        //            }

        //            return 0;
        //        });
        //        return editedAssetTypes;
        //}


        //// TODO: To be tested, if functionality needed
        //function removeDuplicateAssetIds(data) {
        //    for (var i = 0; i < data.length; i++) {
        //        if (data[i].assetId === data[i - 1].assetId)
        //            data.splice(i, 1);
        //    }
        //    return data;
        //}


    //}

    */ 




}());