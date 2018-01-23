define([
  "esri/layers/FeatureLayer",
  "esri/symbols/SimpleMarkerSymbol",

  "modules/spatialStats",
  "modules/filterUtils",
  "esri/core/lang",
], function(
  FeatureLayer, SimpleMarkerSymbol, spatialStats, filterUtils, lang
){

  var allFeatures = [];
  var eventsLayer = null;

  function getAllFeatures (layer){
    var q = layer.createQuery();
    return layer.load()
      .then(function(){
        return layer.queryFeatures(q);
      })
      .then(function(response){
        allFeatures = response.features;
        return allFeatures;
      }).otherwise(e => { console.log(e) });
  }

  function createLayer(portalItemId){
    eventsLayer = new FeatureLayer({
      portalItem: {
        id: portalItemId
      },
      outFields: ["*"],
      // definitionExpression: "GENERATION <= 2"
    });
    return eventsLayer;
  }

  function addHappenedUniqueValues(renderer){
    var r = renderer.clone();
    r.addUniqueValueInfo({
      value: "0-past",
      symbol: new SimpleMarkerSymbol({
        color: [85, 255, 0, 0.15],
        size: "8px",
        outline: {
          color: [85, 255, 0, 0.25],
          width: 0.5
        }
      })
    });

    r.addUniqueValueInfo({
      value: "m-past",
      symbol: new SimpleMarkerSymbol({
        color: [255, 0, 0, 0.15],
        size: "8px",
        outline: {
          color: [255, 0, 0, 0.25],
          width: 0.5
        }
      })
    });

    r.addUniqueValueInfo({
      value: "p-past",
      symbol: new SimpleMarkerSymbol({
        color: [0, 197, 255, 0.15],
        size: "8px",
        outline: {
          color: [0, 197, 255, 0.25],
          width: 0.5
        }
      })
    });

    return r;
  }

  var getEventsLayer = function(portalItemId){

    var layer = createLayer(portalItemId);

    return getAllFeatures(layer)
      .then(function(features){

      var renderer = addHappenedUniqueValues(layer.renderer);

      var graphicsFeatureLayer = new FeatureLayer({
        source: [],//features,
        fields: lang.clone(layer.fields),
        objectIdField: lang.clone(layer.objectIdField),
        geometryType: lang.clone(layer.geometryType),
        spatialReference: layer.spatialReference.clone(),
        renderer: renderer,
        title: "Significant Events"
      });

      return graphicsFeatureLayer.load()
        .then(function(){

        return {
          layer: graphicsFeatureLayer,
          features: features
        };

      });

    });

  };

  var getGenerationsLayer = function(features, splitBySide){

    let fieldsToSummarize = [
      "DIST_BIRTH_DEATH",
      "DIST_BIRTH_MARRIAGE",
      "numPoints"
    ];

    let gmcFeatures = [];
    // gmcFeatures.push(filterUtils.filterPeopleByGeneration(features, 0)[0]);
    
    let objId = 0;

    for(let i = 1; i <= 6; i++){

      let generationFeatures = [];

      if(i === 1){
        let gen0 = filterUtils.filterPeopleByGeneration(features, 0);
        let gen1 = filterUtils.filterPeopleByGeneration(features, 1);
        generationFeatures = gen0.concat(gen1);
      } else {
        generationFeatures = filterUtils.filterPeopleByGeneration(features, i);
      }
      
      if(!splitBySide || i === 1){
        let gmc = spatialStats.geographicMeanCenter(generationFeatures, false, fieldsToSummarize);
        gmc.attributes.OBJECTID = objId++;
        gmc.attributes.GENERATION = i;
        gmcFeatures.push(gmc);
      } else {
        let maternalFeatures = filterUtils.filterPeopleBySide(generationFeatures, "m");
        let gmcM = spatialStats.geographicMeanCenter(maternalFeatures, false, fieldsToSummarize);
        gmcM.attributes.OBJECTID = objId++;
        gmcM.attributes.GENERATION = i;
        gmcM.attributes.GEN_0_SIDE = "m";
        gmcFeatures.push(gmcM);

        let paternalFeatures = filterUtils.filterPeopleBySide(generationFeatures, "p");
        let gmcP = spatialStats.geographicMeanCenter(paternalFeatures, false, fieldsToSummarize);
        gmcP.attributes.OBJECTID = objId++;
        gmcP.attributes.GENERATION = i;
        gmcP.attributes.GEN_0_SIDE = "p";
        gmcFeatures.push(gmcP);
      }
    }

    const expressionInfos = [{
      name: "title",
      title: "Generation",
      expression: `
        var side = IIF(IsEmpty($feature.GEN_0_SIDE), "", $feature.GEN_0_SIDE);
        var gen = $feature.GENERATION;
        var finalDigit = Number(Right(gen, 1));
        var genSuffix = WHEN(
          finalDigit == 1, 'st',
          finalDigit == 2, 'nd',
          finalDigit == 3, 'rd',
          'th'
        );
        gen + genSuffix + ' generation ' + WHEN(side == 'm', 'maternal', side == 'p', 'paternal', '');
      `
    }]

    let layer = new FeatureLayer({
      title: "GMC by generation",
      source: gmcFeatures,
      fields: [{
        name: "OBJECTID",
        alias: "OBJECTID",
        type: "oid"
      }, {
        name: "GENERATION",
        alias: "GENERATION",
        type: "number"
      }, {
        name: "GEN_0_SIDE",
        alias: "Side of generation 0's family",
        type: "string"
      }, {
        name: "DIST_BIRTH_DEATH",
        alias: "DIST_BIRTH_DEATH",
        type: "number"
      }, {
        name: "DIST_BIRTH_MARRIAGE",
        alias: "DIST_BIRTH_MARRIAGE",
        type: "number"
      }, {
        name: "avg_dist_points_gmc",
        alias: "avg_dist_points_gmc",
        type: "number"
      }, {
        name: "avg_DIST_BIRTH_DEATH",
        alias: "avg_DIST_BIRTH_DEATH",
        type: "number"
      }, {
        name: "avg_DIST_BIRTH_MARRIAGE",
        alias: "avg_DIST_BIRTH_MARRIAGE",
        type: "number"
      }, {
        name: "avg_numPoints",
        alias: "avg_numPoints",
        type: "number"
      }],
      objectIdField: "OBJECTID",
      geometryType: "point",
      spatialReference: eventsLayer.spatialReference.clone(),
      renderer: {
        type: "simple",
        symbol: {
          type: "simple-marker",
          color: [0,255,0],
          size: 10,
          outline: {
            width: 1,
            color: [0,255,0,0.5]
          }
        }
      },
      popupTemplate: {
        title: "{expression/title}",
        content: "birth to death: {avg_DIST_BIRTH_DEATH}; birth to marriage: {avg_DIST_BIRTH_MARRIAGE}",
        expressionInfos: expressionInfos
        // content: [{
        //   type: "fields",
        //   fieldInfos: [{
        //     fieldName: "GENERATION",
        //     // label: ""
        //   }, {
        //     fieldName: "GEN_0_SIDE",
        //     // label: ""
        //   }, {
        //     fieldName: "MOTHER",
        //     // label: ""
        //   }, {
        //     fieldName: "FATHER",
        //     // label: ""
        //   }, {
        //     fieldName: "DIST_BIRTH_DEATH",
        //     // label: ""
        //   }, {
        //     fieldName: "DIST_BIRTH_MARRIAGE",
        //     // label: ""
        //   }]
        // }]
      }
    });
    
    return {
      layer: layer,
      features: gmcFeatures
    }
  }

  var getPeopleLayer = function(features){
    return filterUtils.fetchUniqueValues(eventsLayer, "ID")
      .then(function(ids){
        console.log(ids);

        var gmcFeatures = ids.map( (id, i) => {
          var events = filterUtils.filterEventsForPerson(features, id);

          var gmc = spatialStats.geographicMeanCenter(events, true);

          var birthEvent = filterUtils.getBirthEvents(events)[0];
          var marriageEvent = filterUtils.getMarriageEvents(events)[0];
          var deathEvent = filterUtils.getDeathEvents(events)[0];

          var distBirthMarriage = birthEvent && marriageEvent ? spatialStats.distanceBetweenFeatures([birthEvent, marriageEvent], "kilometers") : -1;
          var distBirthDeath = birthEvent && deathEvent ? spatialStats.distanceBetweenFeatures([birthEvent, deathEvent], "kilometers") : -1;

          gmc.attributes.OBJECTID = i;
          gmc.attributes.ID = id;
          gmc.attributes.NAME = birthEvent ? lang.clone(birthEvent.attributes.NAME) : "";
          gmc.attributes.SURNAME = birthEvent ? lang.clone(birthEvent.attributes.SURNAME) : "";
          gmc.attributes.GENERATION = birthEvent ? lang.clone(birthEvent.attributes.GENERATION) : "";
          gmc.attributes.GEN_0_SIDE = birthEvent ? lang.clone(birthEvent.attributes.GEN_0_SIDE) : "";
          gmc.attributes.MOTHER = birthEvent ? lang.clone(birthEvent.attributes.MOTHER) : "";
          gmc.attributes.FATHER = birthEvent ? lang.clone(birthEvent.attributes.FATHER) : "";
          gmc.attributes.SPOUSE = marriageEvent ? lang.clone(marriageEvent.attributes.SPOUSE) : "";
          gmc.attributes.DIST_BIRTH_DEATH = distBirthDeath;
          gmc.attributes.DIST_BIRTH_MARRIAGE = distBirthMarriage;

          return gmc;
        });

        var layer = new FeatureLayer({
          title: "GMC by person",
          source: gmcFeatures,
          fields: [{
            name: "OBJECTID",
            alias: "OBJECTID",
            type: "oid"
          }, {
            name: "ID",
            alias: "ID",
            type: "string"
          }, {
            name: "NAME",
            alias: "NAME",
            type: "string"
          }, {
            name: "SURNAME",
            alias: "SURNAME",
            type: "string"
          }, {
            name: "GENERATION",
            alias: "GENERATION",
            type: "number"
          }, {
            name: "GEN_0_SIDE",
            alias: "GEN_0_SIDE",
            type: "string"
          }, {
            name: "MOTHER",
            alias: "MOTHER",
            type: "string"
          }, {
            name: "FATHER",
            alias: "FATHER",
            type: "string"
          }, {
            name: "DIST_BIRTH_DEATH",
            alias: "DIST_BIRTH_DEATH",
            type: "number"
          }, {
            fieldName: "DIST_BIRTH_MARRIAGE",
            alias: "DIST_BIRTH_MARRIAGE",
            type: "number"
          }],
          objectIdField: "OBJECTID",
          geometryType: "point",
          spatialReference: eventsLayer.spatialReference.clone(),
          renderer: {
            type: "simple",
            symbol: {
              type: "simple-marker",
              color: [255,0,0],
              size: 10,
              outline: {
                width: 1,
                color: [255,0,0]
              }
            }
          },
          popupTemplate: {
            title: "{NAME} {SURNAME}",
            content: "MOTHER: {MOTHER}; FATHER: {FATHER};<br>"
               + "b2d: {DIST_BIRTH_DEATH};" // b2m: {DIST_BIRTH_MARRIAGE}"
            // content: [{
            //   type: "fields",
            //   fieldInfos: [{
            //     fieldName: "GENERATION",
            //     // label: ""
            //   }, {
            //     fieldName: "GEN_0_SIDE",
            //     // label: ""
            //   }, {
            //     fieldName: "MOTHER",
            //     // label: ""
            //   }, {
            //     fieldName: "FATHER",
            //     // label: ""
            //   }, {
            //     fieldName: "DIST_BIRTH_DEATH",
            //     // label: ""
            //   }, {
            //     fieldName: "DIST_BIRTH_MARRIAGE",
            //     // label: ""
            //   }]
            // }]
          }
        });

        return {
          layer: layer,
          features: gmcFeatures
        };
      });
  }

  return {
    getEventsLayer: getEventsLayer,
    getGenerationsLayer: getGenerationsLayer,
    getPeopleLayer: getPeopleLayer
  };

});