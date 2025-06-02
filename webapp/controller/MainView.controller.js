sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/List",
    "sap/m/BusyDialog",
    "sap/m/StandardListItem",
    "vectorengines4h/model/models/Formatter",

],
    function (Controller, Dialog, Button, List, StandardListItem, Filter, FilterOperator, Formatter) {
        "use strict";

        return Controller.extend("vectorengines4h.controller.MainView", {

            onInit: function () {
                var oDataModel = this.getOwnerComponent().getModel(); // ODataModel por defecto
                var that = this;

                // Model to store state of the table
                const oViewModel = new sap.ui.model.json.JSONModel({
                    expanded: false,
                    maxItems: 3,
                    showMetadataView: "string",
                    showInfoFilterCard: false,

                    //countItemsInRow: 5,
                });
                this.getView().setModel(oViewModel, "viewModel");

                // Create view model for configuration
                const oConfigModel = new sap.ui.model.json.JSONModel({
                    selectedId: "" // Default value
                });
                this.getView().setModel(oConfigModel, "configModel");

                // Inicializar modelo para top-k
                var oTopKModel = new sap.ui.model.json.JSONModel({
                    value: 5  // Valor por defecto
                });
                this.getView().setModel(oTopKModel, "topkResultsModel");




            },
            onCloseFilterFragment: function () {
                if (this.oFilterDialog) {
                    this.oFilterDialog.close();
                }
            },

            parsemongoFilters: function (query) {
                let filters = [];

                // Si es un operador lógico ($and, $or, etc)
                if (typeof query === 'object' && query !== null && ['$and', '$or', '$nor'].some(op => op in query)) {
                    // Tomamos el operador lógico que hay
                    for (const op of ['$and', '$or', '$nor']) {
                        if (op in query) {
                            // Recorremos cada condición dentro del array del operador lógico
                            query[op].forEach(cond => {
                                filters = filters.concat(this.parsemongoFilters(cond)); // Recursión para cada condición
                            });
                            return filters;
                        }
                    }
                }

                // Si es un objeto normal (sin operador lógico), recorrer campos y operadores
                if (typeof query === 'object' && query !== null) {
                    for (const field in query) {
                        if (typeof query[field] === 'object' && query[field] !== null) {
                            for (const operator in query[field]) {
                                filters.push({
                                    field,
                                    operator,
                                    value: query[field][operator]
                                });
                            }
                        } else {
                            // Si no tiene operador, asumimos igualdad directa
                            filters.push({
                                field,
                                operator: '$eq',
                                value: query[field]
                            });
                        }
                    }
                }

                return filters;
            },

            loadFragmentFilters: async function (filtersRaw) {
                if (!this.oFilterDialog) {
                    this.oFilterDialog = sap.ui.xmlfragment(
                        "vectorengines4h.view.QueryFilter", // Asegúrate de que sea la ruta correcta
                        this
                    );
                    this.getView().addDependent(this.oFilterDialog);
                }

                const config = JSON.parse(filtersRaw);

                // Convertimos filters a array para el binding
                const filtersArray = this.parsemongoFilters(config.filters || {});

                const model = new sap.ui.model.json.JSONModel({
                    filters: filtersArray,
                    sorts: config.sorts || [],
                    rewrittenQuery: config.rewrittenQuery || "",
                    strict: config.strict === true
                });

                this.oFilterDialog.setModel(model, "filterModel");

                this.oFilterDialog.open();
            },


            onOpenConfig: function () {
                if (!this._oConfigDialog) {
                    this._oConfigDialog = sap.ui.xmlfragment(
                        "vectorengines4h.view.MainView",
                        this
                    );
                    this.getView().addDependent(this._oConfigDialog);
                }

                // Ensure we have a config model
                let oConfigModel = this.getView().getModel("configModel");
                if (!oConfigModel) {
                    oConfigModel = new sap.ui.model.json.JSONModel({
                        selectedId: null
                    });
                    this.getView().setModel(oConfigModel, "configModel");
                }

                this._oConfigDialog.open();
            },
            onConfigChange: function (oEvent) {
                const sSelectedId = oEvent.getParameter("selectedItem").getKey();
                const oConfigModel = this.getView().getModel("configModel");
                oConfigModel.setProperty("/selectedId", sSelectedId);
            },
            onSaveConfig: function (oEvent) {
                // Get Select control from fragment
                const oSelect = sap.ui.getCore().byId("configSelect");
                if (!oSelect) {
                    sap.m.MessageToast.show("Error: No se pudo encontrar el selector de configuración");
                    return;
                }

                // Get selected key from Select
                const sSelectedId = oSelect.getSelectedKey();
                if (!sSelectedId) {
                    sap.m.MessageToast.show("Por favor, seleccione una configuración");
                    return;
                }

                // Update configModel with selected value
                const oConfigModel = this.getView().getModel("configModel");
                oConfigModel.setProperty("/selectedId", sSelectedId);

                sap.m.MessageToast.show("Configuración guardada: " + sSelectedId);


                //get id of the controller searchfield
                const oSearchField = this.byId("searchField");
                if (oSearchField) {
                    //check length of the search field
                    const sQuery = oSearchField.getValue();
                    if (sQuery && sQuery.length > 0) {
                        //if length is greater than 0, set the search field to empty
                        this.onSearch(oEvent, sQuery);

                    }
                }
                this._oConfigDialog.close();
            },



            onCloseConfig: function () {
                const oModel = this.getOwnerComponent().getModel();
                oModel.resetChanges();
                this._oConfigDialog.close();
            },

            onToggleTableExpand: function () {
                const oViewModel = this.getView().getModel("viewModel");
                const bExpanded = oViewModel.getProperty("/expanded");
                oViewModel.setProperty("/expanded", !bExpanded);
            },

            formatTableLength: function (bExpanded) {
                const oFullData = this.getOwnerComponent().getModel("metadataModel").getProperty("/originalItems");
                const aLimited = bExpanded ? oFullData : oFullData.slice(0, 5); // mostrar 5 si no está expandido
                this.getOwnerComponent().getModel("metadataModel").setProperty("/items", aLimited);
            },
            getScoreColorClass: function (score) {
                if (score > 0.75) {
                    return "scoreGreen";
                } else if (score > 0.3) {
                    return "scoreOrange";
                } else {
                    return "scoreRed";
                }
            },

            onShowMetadataSearcher: function (oEvent) {
                const oContext = oEvent.getSource().getBindingContext();
                if (oContext) {
                    const sMetadata = oContext.getProperty("Metadata");
                    try {
                        const oMetadataJson = JSON.parse(sMetadata);
                        this.showMetadataInList(oMetadataJson);
                    } catch (e) {
                        console.error("Error parsing metadata:", e);
                    }
                }
            },

            showMetadataInList: function (oMetadataJson) {

                const oList = new sap.m.List({
                    headerToolbar: new sap.m.Toolbar({
                        content: [
                            new sap.m.SearchField({
                                width: "100%",
                                placeholder: "Buscar en metadata...",
                                liveChange: function (oEvent) {
                                    const sQuery = oEvent.getParameter("newValue");
                                    const oBinding = oList.getBinding("items");

                                    if (sQuery) {
                                        const oFilter = new sap.ui.model.Filter({
                                            path: "title",
                                            operator: sap.ui.model.FilterOperator.Contains,
                                            value1: sQuery
                                        });
                                        oBinding.filter([oFilter]);
                                    } else {
                                        oBinding.filter([]);
                                    }
                                }
                            })
                        ]
                    }),
                    items: {
                        path: "/",
                        template: new sap.m.StandardListItem({
                            title: "{title}",
                            description: "{description}"
                        })
                    }
                });

                const oModel = new sap.ui.model.json.JSONModel(
                    Object.keys(oMetadataJson).map(function (key) {
                        return {
                            title: key,
                            description: oMetadataJson[key]
                        };
                    })
                );
                oList.setModel(oModel);

                // Mostramos la lista en un Dialog
                const oDialog = new sap.m.Dialog({
                    title: "Metadata",
                    contentWidth: "500px",
                    contentHeight: "400px",
                    content: [oList],
                    endButton: new sap.m.Button({
                        text: "Cerrar",
                        press: function () {
                            oDialog.close();
                        }
                    })
                });

                oDialog.open();
            },

            isNotFirstItem: function (sId) {
                // Obtiene la lista y compara el Id del contexto con el primer Id de la lista
                const oList = this.getView().byId("carList");
                if (!oList) return true;
                const aItems = oList.getBinding("items").getContexts();
                if (aItems.length === 0) return true;
                // El primer contexto es el que quieres ocultar
                return aItems[0].getProperty("Id") !== sId;
            },


            onShowInfoDialog: function () {
                //obtener el modelo de queryModel>/filtersApplied
                const filtersJSON = this.getView().getModel("queryModel").getProperty("/filtersApplied");
                this.loadFragmentFilters(filtersJSON);
            },

            onSearch: function (oEvent, query) {
                // Obtener el modelo de configuración de la vista

                const oConfigModel = this.getView().getModel("configModel");

                //Topk model
                let iTopKValue = 5; // Valor por defecto
                const oTopKModel = this.getView().getModel("topkResultsModel");
                // Validar que el modelo de configuración está disponible
                if (oTopKModel) {

                    // Validar que el valor de top-k es un número válido
                    iTopKValue = oTopKModel.getProperty("/value");
                    // const parsedTopK = parseInt(rawTopK, 10);
                    // iTopKValue = isNaN(parsedTopK) ? 5 : parsedTopK;

                }

                // Validar que existe una configuración seleccionada
                if (!oConfigModel || !oConfigModel.getProperty("/selectedId")) {
                    // Mostrar mensaje si no hay configuración seleccionada
                    sap.m.MessageBox.information(
                        "Por favor, seleccione una configuración primero",
                        {
                            onClose: () => {
                                this.onOpenConfig(); // Abrir la pantalla de configuración
                            }
                        }
                    );
                    return; // Salir del método si no hay configuración válida
                }

                // Obtener el término de búsqueda desde el evento o argumento
                let sQuery = "";
                if (!query) {
                    sQuery = oEvent.getParameter("query");
                } else {
                    sQuery = query;
                }

                // Obtener la lista y su binding para aplicar filtros
                const oList = this.byId("carList");
                const oBinding = oList.getBinding("items");
                const that = this;

                // Validar que se ha introducido un término de búsqueda
                if (!sQuery || sQuery.trim() === "") {
                    sap.m.MessageToast.show("Por favor, introduce un término de búsqueda");
                    return;
                }

                // Mostrar diálogo de espera mientras se realiza la búsqueda
                const oBusyDialog = new sap.m.BusyDialog({
                    title: "Buscando",
                    text: "Procesando su consulta..."
                });
                oBusyDialog.open();

                // Obtener el ID de configuración seleccionado
                const sSelectedId = oConfigModel.getProperty("/selectedId");

                // Crear filtros: por término de búsqueda e ID de configuración
                const aFilter = [
                    new sap.ui.model.Filter("Id", sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("Id", sap.ui.model.FilterOperator.EQ, sSelectedId),
                    new sap.ui.model.Filter("TopK", sap.ui.model.FilterOperator.EQ, String(iTopKValue))
                ];

                // PRIMERO: Aplicar filtros al binding de la lista
                oBinding.filter(aFilter);

                // SEGUNDO: Escuchar evento cuando se reciben los datos del binding tras aplicar el filtro
                oBinding.attachEventOnce("dataReceived", function (oEvent) {

                    let aContexts = oBinding.getContexts(); // Obtener los contextos (resultados)

                    // Mapear los resultados obtenidos
                    const aCars = aContexts.map(ctx => ctx.getObject());

                    // Crear un modelo con resumen de la búsqueda
                    const oQueryData = {
                        totalResults: aCars.length,
                        filtersApplied: aCars[0]?.filters || null,
                        additionalInfo: aCars[0]?.additionalInfo,
                        searchTerm: sQuery
                    };
                    const oQueryModel = new sap.ui.model.json.JSONModel(oQueryData);
                    that.getView().setModel(oQueryModel, "queryModel");

                    // Actualizar el modelo de vista con los resultados
                    const oMetadataModel = that.getView().getModel("viewModel");
                    oMetadataModel.setProperty("/showInfoFilterCard", true);

                    // Eliminar el primer resultado del array (posible dummy u otro propósito)
                    // if (aContexts.length > 0) {
                    //     aContexts.shift();
                    // }

                    // Procesar cada resultado para analizar su metadata
                    aContexts.forEach((oContext, index) => {
                        const oItem = oContext.getObject();
                        try {
                            const oMetadata = JSON.parse(oItem.Metadata); // Parsear campo JSON

                            // Crear una vista previa con los 3 primeros atributos
                            const aPreview = Object.keys(oMetadata).slice(0, 3).map(key => ({
                                property: key,
                                value: typeof oMetadata[key] === 'object' ?
                                    JSON.stringify(oMetadata[key]) :
                                    oMetadata[key]
                            }));

                            // Crear la metadata completa
                            const aFull = Object.keys(oMetadata).map(key => ({
                                property: key,
                                value: typeof oMetadata[key] === 'object' ?
                                    JSON.stringify(oMetadata[key]) :
                                    oMetadata[key]
                            }));

                            // Crear modelo local con la metadata para este item
                            const oPreviewModel = new sap.ui.model.json.JSONModel({
                                preview: aPreview,
                                full: aFull,
                                expanded: false,
                                selected: false // Estado inicial del item
                            });

                            // Asignar el modelo local al CustomListItem correspondiente
                            const oListItem = oList.getItems()[index];
                            if (oListItem) { // Verificar que el item existe
                                oListItem.setModel(oPreviewModel, "localMetadata");
                            }

                        } catch (e) {
                            // En caso de error al parsear la metadata, no hacer nada
                            console.warn("Error parsing metadata for item:", e);
                        }
                    });

                    // Cerrar el diálogo de espera una vez procesados los resultados
                    oBusyDialog.close();
                });

                // Mostrar la vista de metadata (señal al modelo de vista)
                this.getView().getModel("viewModel").setProperty("/showMetadataView", "string");
            },
            onToggleMetadataView: function () {
                const oViewModel = this.getView().getModel("viewModel");
                const sCurrent = oViewModel.getProperty("/showMetadataView");
                oViewModel.setProperty("/showMetadataView", sCurrent === "table" ? "string" : "table");
            },
            formatMetadataPreview: function (oMetadata) {
                if (!oMetadata) return "";
                try {
                    const oMetadataObj = typeof oMetadata === "string" ? JSON.parse(oMetadata) : oMetadata;
                    //Ponemos en negrita las propiedades
                    const sString = Object.entries(oMetadataObj)
                        .map(([key, value]) => `<strong>${key}</strong>: ${value}`)
                        .join(", ");
                    return sString.length > 300 ? sString.substring(0, 700) + "..." : sString;
                } catch (e) {
                    return "";
                }
            },
            formatMetadataString: function (oMetadata) {
                if (!oMetadata) return "";

                try {

                    const oMetadataObj = typeof oMetadata === 'string' ? JSON.parse(oMetadata) : oMetadata;

                    const count = Object.entries(oMetadataObj).length;

                    // Guardar el conteo en el viewModel
                    const oViewModel = this.getView().getModel("viewModel");
                    oViewModel.setProperty("/countItemsInRow", count);

                    return Object.entries(oMetadataObj)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n');

                } catch (e) {

                    return "";
                }
            },

            onToggleMetadataExpand: function (oEvent) {

                const oListItem = oEvent.getSource().getParent().getParent().getParent();
                const oPreviewModel = oListItem.getModel("localMetadata");
                const bExpanded = oPreviewModel.getProperty("/expanded");
                oPreviewModel.setProperty("/expanded", !bExpanded);
            },
            onShowMetadata: function (oEvent) {
                const oContext = oEvent.getSource().getBindingContext();

                if (oContext) {
                    const sMetadata = oContext.getProperty("Metadata");
                    try {
                        const oMetadataJson = JSON.parse(sMetadata);
                        const aMetadataItems = Object.keys(oMetadataJson).map(function (key) {
                            return {
                                property: key,
                                value: oMetadataJson[key]
                            };
                        });

                        // Crear y setear el modelo
                        const oMetadataModel = new sap.ui.model.json.JSONModel({
                            items: aMetadataItems
                        });
                        this.getView().setModel(oMetadataModel, "metadataModel");

                    } catch (e) {
                        console.error("Error parsing metadata:", e);
                    }
                }
            },

            onLiveChange: function (oEvent) {
                const sQuery = oEvent.getParameter("newValue");
                const oSearchField = oEvent.getSource();

                if (sQuery && sQuery.length > 0) {
                    oSearchField.addStyleClass("expanded");
                } else {
                    oSearchField.removeStyleClass("expanded");
                }
            },

            onExcelUpload: function () {
                if (!this._oExcelDialog) {
                    this._oExcelDialog = sap.ui.xmlfragment(
                        "vectorengines4h.view.ExcelUploadDialog",
                        this
                    );
                    this.getView().addDependent(this._oExcelDialog);
                }
                this._oExcelDialog.open();
            },

            onUploadExcel: function () {
                const oFileUploader = sap.ui.getCore().byId("fileUploader");
                const oIndexInput = sap.ui.getCore().byId("indexInput");
                const sIndexName = oIndexInput.getValue();

                if (!sIndexName) {
                    sap.m.MessageToast.show("Por favor, introduce un nombre de índice");
                    return;
                }

                const aFiles = oFileUploader.getFocusDomRef().files;
                if (!aFiles || aFiles.length === 0) {
                    sap.m.MessageToast.show("Por favor, selecciona un archivo Excel");
                    return;
                }

                const oFile = aFiles[0];
                const oReader = new FileReader();

                oReader.onload = function (e) {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: "array" });

                    // Por simplicidad, solo usamos la primera hoja
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convertimos la hoja a JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });


                    console.log("JSON convertido del Excel:", jsonData);

                    sap.m.MessageToast.show("Archivo leído y convertido correctamente");
                    this._oExcelDialog.close();


                    const oModel = new sap.ui.model.json.JSONModel(jsonData);
                    this.getView().setModel(oModel, "excelData");
                }.bind(this);

                oReader.readAsArrayBuffer(oFile);
            }
            ,

            onCloseExcelDialog: function () {
                this._oExcelDialog.close();
            },

            onSelectionChange: function (oEvent) {
                const aSelectedItems = oEvent.getSource().getSelectedItems();
                aSelectedItems.forEach((oItem) => {
                    const sPath = oItem.getBindingContext().getPath(); // e.g., "/carsSet/3"
                    const oData = oItem.getBindingContext().getObject();
                    console.log("Seleccionado:", oData, sPath);
                });
            },

            toBase64Unicode: function (str) {
                return window.btoa(
                    new TextEncoder().encode(str).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
            }
            ,

            onShowStats: function () {
                const oConfigModel = this.getView().getModel("configModel");
                const sConfigId = oConfigModel.getProperty("/selectedId");

                const oList = this.byId("carList");
                const aSelectedItems = oList.getSelectedItems();
                const aSelectedData = aSelectedItems.map(function (oItem) {
                    return oItem.getBindingContext().getObject();
                });

                if (!sConfigId || aSelectedData.length === 0) {
                    sap.m.MessageToast.show("Selecciona al menos un item.");
                    return;
                }

                // Construye el array de resultados
                const aResults = aSelectedData.map(function (oCar) {
                    return {
                        id: oCar.Id,
                        score: oCar.Score,
                        metadata: typeof oCar.Metadata === "string" ? JSON.parse(oCar.Metadata) : oCar.Metadata
                    };
                });

                // Construye el objeto que irá como string en "query"
                const oQuery = {
                    records: aResults,
                    columnsToCompare: Object.keys(aResults[0].metadata)
                };

                // Prepara el payload final "btoa(JSON.stringify(oQuery.records))
                const oPayload = {
                    QUERY:this.toBase64Unicode(JSON.stringify(oQuery)), 
                    CONFIG_ID: sConfigId,
                };

                var oModel = this.getOwnerComponent().getModel(); // ODataModel

                oModel.create("/statsSet", oPayload, {
                    success: function (oData) {
                        // Primer nivel: deserializar oData.RESULT
                        var sStats = oData.RESULT || "";
                        var oStatsContainer;
                        try {
                            oStatsContainer = typeof sStats === "string" ? JSON.parse(sStats) : sStats;
                        } catch (e) {
                            sap.m.MessageToast.show("No se pudo leer el primer nivel de stats");
                            return;
                        }

                        // Segundo nivel: deserializar la propiedad 'result' dentro del JSON
                        var oStats;
                        try {
                            var sResultString = oStatsContainer.result || "";
                            oStats = typeof sResultString === "string" ? JSON.parse(sResultString) : sResultString;
                        } catch (e) {
                            sap.m.MessageToast.show("No se pudo leer la propiedad 'result' dentro de stats");
                            return;
                        }

                        // Función para aplanar el JSON de forma recursiva - MEJORADA
                        function flattenObject(obj, prefix = '', maxDepth = 10, currentDepth = 0) {
                            var flattened = [];

                            // Prevenir recursión infinita
                            if (currentDepth >= maxDepth) {
                                flattened.push({
                                    property: prefix,
                                    value: "[Objeto muy profundo - truncado]"
                                });
                                return flattened;
                            }

                            for (var key in obj) {
                                if (obj.hasOwnProperty(key)) {
                                    var newKey = prefix ? prefix + '.' + key : key;
                                    var value = obj[key];

                                    if (value === null) {
                                        flattened.push({
                                            property: newKey,
                                            value: "null"
                                        });
                                    } else if (value === undefined) {
                                        flattened.push({
                                            property: newKey,
                                            value: "undefined"
                                        });
                                    } else if (Array.isArray(value)) {
                                        // Para arrays, mostrar cada elemento
                                        if (value.length === 0) {
                                            flattened.push({
                                                property: newKey,
                                                value: "[]"
                                            });
                                        } else {
                                            // Si los elementos del array son objetos, aplanarlos
                                            value.forEach(function (item, index) {
                                                if (item !== null && typeof item === 'object') {
                                                    flattened = flattened.concat(
                                                        flattenObject(item, newKey + '[' + index + ']', maxDepth, currentDepth + 1)
                                                    );
                                                } else {
                                                    flattened.push({
                                                        property: newKey + '[' + index + ']',
                                                        value: String(item)
                                                    });
                                                }
                                            });
                                        }
                                    } else if (typeof value === 'object') {
                                        // Si es un objeto, continuar aplanando recursivamente
                                        flattened = flattened.concat(
                                            flattenObject(value, newKey, maxDepth, currentDepth + 1)
                                        );
                                    } else {
                                        // Si es un valor primitivo, agregarlo a la lista
                                        flattened.push({
                                            property: newKey,
                                            value: String(value)
                                        });
                                    }
                                }
                            }

                            return flattened;
                        }

                        // Aplanar el objeto completo con todas las secciones
                        var aStats = flattenObject(oStats);

                        console.log("Total de propiedades deserializadas:", aStats.length);
                        console.log("Primeras 10 propiedades:", aStats.slice(0, 10));

                        var oStatsModel = new sap.ui.model.json.JSONModel({
                            stats: aStats,
                            totalCount: aStats.length
                        });

                        // Lista con scroll y búsqueda
                        var oSearchField = new sap.m.SearchField({
                            placeholder: "Buscar propiedad...",
                            liveChange: function (oEvent) {
                                var sQuery = oEvent.getParameter("newValue");
                                var oList = oDialog.getContent()[1]; // La lista es el segundo elemento
                                var oBinding = oList.getBinding("items");

                                if (sQuery && sQuery.length > 0) {
                                    var oFilter = new sap.ui.model.Filter("property", sap.ui.model.FilterOperator.Contains, sQuery);
                                    oBinding.filter([oFilter]);
                                } else {
                                    oBinding.filter([]);
                                }
                            }
                        });

                        var oCountLabel = new sap.m.Label({
                            text: "Total de propiedades: " + aStats.length
                        });

                        var oList = new sap.m.List({
                            growing: true,
                            growingThreshold: 50,
                            items: {
                                path: "/stats",
                                template: new sap.m.StandardListItem({
                                    title: "{property}",
                                    description: "{value}",
                                    tooltip: "{property}: {value}"
                                })
                            }
                        });
                        oList.setModel(oStatsModel);

                        var oDialog = new sap.m.Dialog({
                            title: "Estadísticas Completas",
                            contentWidth: "700px",
                            contentHeight: "80%",
                            resizable: true,
                            draggable: true,
                            content: [
                                new sap.m.VBox({
                                    items: [
                                        oCountLabel,
                                        oSearchField,
                                        oList
                                    ]
                                })
                            ],
                            endButton: new sap.m.Button({
                                text: "Cerrar",
                                press: function () {
                                    oDialog.close();
                                    oDialog.destroy();
                                }
                            }),
                            beginButton: new sap.m.Button({
                                text: "Exportar JSON",
                                press: function () {
                                    // Crear un blob con el JSON completo
                                    var sJsonString = JSON.stringify(oStats, null, 2);
                                    var oBlob = new Blob([sJsonString], { type: "application/json" });
                                    var sUrl = URL.createObjectURL(oBlob);

                                    // Crear enlace de descarga
                                    var oLink = document.createElement("a");
                                    oLink.href = sUrl;
                                    oLink.download = "estadisticas_completas.json";
                                    document.body.appendChild(oLink);
                                    oLink.click();
                                    document.body.removeChild(oLink);
                                    URL.revokeObjectURL(sUrl);

                                    sap.m.MessageToast.show("JSON exportado exitosamente");
                                }
                            })
                        });
                        oDialog.open();
                    },
                    error: function () {
                        sap.m.MessageToast.show("Error al consultar statsSet");
                    }
                });
            },

            onOpenTopKDialog: function () {
                if (!this._oTopKDialog) {
                    this._oTopKDialog = new sap.m.Dialog({
                        title: "Top-K resultados por defecto",
                        content: [
                            new sap.m.VBox({
                                alignItems: "Center",
                                width: "100%",
                                items: [
                                    new sap.m.Input({
                                        type: "Number",
                                        value: "{topkResultsModel>/value}",
                                        description: "resultados",
                                        width: "75%" // Ajusta el ancho como desees
                                    })
                                ]
                            })
                        ],
                        beginButton: new sap.m.Button({
                            text: "Aceptar",
                            press: function () {
                                this._oTopKDialog.close();
                            }.bind(this)
                        }),
                        endButton: new sap.m.Button({
                            text: "Cancelar",
                            press: function () {
                                this._oTopKDialog.close();
                            }.bind(this)
                        })
                    });

                    this.getView().addDependent(this._oTopKDialog);
                }

                this._oTopKDialog.open();
            }

        });
    });
