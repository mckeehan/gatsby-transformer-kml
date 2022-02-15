//const geojson = require('togeojson')
const geojson = require('@tmcw/togeojson');

const DOMParser = require('xmldom').DOMParser;
const crypto = require('crypto')
const path = require("path")
const { createFilePath } = require("gatsby-source-filesystem")

const parseDocument = content => new DOMParser().parseFromString(content);

const parseKML = markup => geojson.kml(parseDocument(markup))
const parseGPX = markup => geojson.gpx(parseDocument(markup))

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  const typeDefs = `
    type GPXfile implements Node @dontInfer {
        features: [Feature]
        center: [Float]
        name: String
        absolutePath: String
        relativePath: String
        mydir: String
        myname: String
        slug: String
    }
    type Feature {
        center: [Float]
        geometry: GPXGeometry
        type: String
        properties: GPXProperties
    }
    type GPXGeometry {
        coordinates: [[Float]]
        type: String
    }
    type GPXProperties {
        name: String
        time: Date
        _gpxType: String
        coordinateProperties: CoordinateProperties
        desc: String
    }
    type CoordinateProperties {
      times: [String]
    }
  `
  createTypes(typeDefs)
}

exports.onCreateNode = async ({ 
  node,
  actions,
  loadNodeContent,
  createNodeId,
  createContentDigest
}) => {

  //parse GPX data
  if (node.internal.mediaType === "application/gpx+xml") {
    const content = await loadNodeContent(node)

    const relativePath = createFilePath({ node, loadNodeContent, trailingSlash: false }).replace(/[|&;$%@"<>()+,]/g, "").replaceAll(/ /g, '-').toLowerCase()
    const { dir = ``, name } = path.parse(relativePath)

    const data = parseGPX(content)

    if (data.type && data.type === "FeatureCollection") {
      if (data.features) {
        const { createNode, createNodeField } = actions
        var pageMinX = pageMinY = pageMaxX = pageMaxY = undefined;
        data.features.forEach(feature => {
          if (feature.type && feature.type === 'Feature' && feature.properties && feature.properties.name) {
            var minX = minY = maxX = maxY = undefined;
            feature.geometry.coordinates.forEach( cord => {
              var x = cord[1];
              var y = cord[0];
              minX = minX === undefined || x < minX ? x : minX;
              minY = minY === undefined || x < minY ? y : minY;
              maxX = maxX === undefined || x > maxX ? x : maxX;
              maxY = maxY === undefined || x > maxY ? y : maxY;
              pageMinX = pageMinX === undefined || x < pageMinX ? x : pageMinX;
              pageMinY = pageMinY === undefined || x < pageMinY ? y : pageMinY;
              pageMaxX = pageMaxX === undefined || x > pageMaxX ? x : pageMaxX;
              pageMaxY = pageMaxY === undefined || x > pageMaxY ? y : pageMaxY;
            })
            if( minX && minY && maxX && maxY ) {
              centerX = ( minX + maxX) / 2;
              centerY = ( minY + maxY) / 2;
            }
            feature.center = [ centerX, centerY ];
          }
        })
        if( pageMinX && pageMinY && pageMaxX && pageMaxY ) {
          pageCenterX = ( pageMinX + pageMaxX) / 2;
          pageCenterY = ( pageMinY + pageMaxY) / 2;
        }

        const nodeId = createNodeId(`gpx-${relativePath}`)
        const nodeContent = JSON.stringify(data.features)
        const nodeContentDigest = crypto
          .createHash('md5')
          .update(nodeContent)
          .digest('hex')

        const nodeData = Object.assign({}, {
          id: nodeId,
          parent: null,
          children: [],
          internal: {
            type: `GPXfile`,
            content: nodeContent,
            contentDigest: nodeContentDigest,
          },
          features: data.features,
          center: [pageCenterX, pageCenterY],
          name: node.name,
          absolutePath: node.absolutePath,
          relativePath: node.relativePath,
          mydir: dir,
          myname: name,
          slug: relativePath,
        })

        createNode(nodeData, createNodeId)
      }
    }
  }

  //parse KML data
  if (node.internal.mediaType === "application/vnd.google-earth.kml+xml") {
    const content = await loadNodeContent(node)

    const data = parseKML(content)

    if (data.type && data.type === "FeatureCollection") {
      if (data.features) {
        const { createNode } = actions
        data.features.forEach(feature => {
          if (feature.type && feature.type === 'Feature' && feature.properties && feature.properties.name) {
            const nodeId = createNodeId(`feature-${feature.properties.name}`)
            const nodeContent = JSON.stringify(feature)
            const nodeContentDigest = crypto
              .createHash('md5')
              .update(nodeContent)
              .digest('hex')

            const nodeData = Object.assign({}, feature, {
              id: nodeId,
              parent: null,
              children: [],
              internal: {
                type: `KML${feature.geometry.type}`,
                content: nodeContent,
                contentDigest: nodeContentDigest,
              },
            })

            createNode(nodeData, createNodeId)
          }
        })
      }
    }

  }

}
