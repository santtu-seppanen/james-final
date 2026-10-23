import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Switch,
  Image,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import {DeviceEventEmitter} from 'react-native';

const onSessionConnect = (event) => {
  console.log(event);
};

DeviceEventEmitter.addListener('onSessionConnect', onSessionConnect);
var refillBottles = [];

export default class Drink extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      serving: false,
      servingText: '',
    };

    this.checkCapacities(this.props.drink.ingredients);
  }

  getDrinkFromJames(drink) {
    fetch('http://localhost:8000/drinkme', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({drink: drink.name}),
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          this.props.onCloseCancel();
        }
      })
      .then((body) => {
        const pourStatus = JSON.parse(body);
        console.log(body);
        if (pourStatus.success) {
          const totalPourTime = Number(pourStatus.pourTime);

          let servingInterval = setInterval(() => {
            this.setState({servingText: this.state.servingText - 1});
          }, 1000);

          this.setState({
            serving: true,
            servingText: totalPourTime / 1000,
            servingInterval,
          });

          setTimeout(() => {
            this.setState({servingInterval: null});
            this.props.onCloseDetail();
          }, totalPourTime);
        } else {
          this.props.onCloseCancel();
        }
      })
      .catch(function (error) {
        console.log(error);
      });
  }

  checkCapacities = (ingredients) => {
    refillBottles = [];
    let outOfCapacity = false;
    this.props.bottles.map((bottle) => {
      ingredients.forEach((ingredient) => {
        if (
          ingredient.name === bottle.name &&
          bottle.capacity < ingredient.serving
        ) {
          outOfCapacity = true;
          if (!refillBottles.includes(bottle.name)) {
            refillBottles.push(bottle.name);
          }
        }
      });
    });
  };

  render() {
    return (
      <SafeAreaView
        style={{
          flex: 1,
        }}>
        {this.props.drink && (
          <View style={{alignItems: 'center'}}>
            {refillBottles.map((bottle, index) => (
              <Text style={{color: 'red', fontSize: 20}}>
                {bottle} is running low!
              </Text>
            ))}
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-evenly',
                alignItems: 'center',
              }}>
              <View>
                {images[this.props.drink.imageUrl] !== undefined ? (
                  <Image
                    source={images[this.props.drink.imageUrl]}
                    style={{width: 200, height: 200}}></Image>
                ) : (
                  <Image
                    source={require('./drinks/drink.png')}
                    style={{width: 100, height: 100}}></Image>
                )}
              </View>
              <View
                style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                  flexDirection: 'column',
                }}>
                <View style={{marginBottom: 20}}>
                  <Text style={{fontWeight: 'bold', fontSize: 28}}>
                    {this.props.drink.friendlyname.toUpperCase()}
                  </Text>
                </View>
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-evenly',
                    alignItems: 'flex-start',
                  }}>
                  <Text style={{fontSize: 16}}>Ingredients:</Text>
                  {this.props.drink.ingredients.map((ingredient, index) => (
                    <View
                      key={index}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        width: 200,
                        paddingTop: 10,
                        justifyContent: 'space-between',
                      }}>
                      <Text style={{fontSize: 16}}>{ingredient.name}</Text>
                      <Text style={{fontSize: 16}}>
                        {ingredient.serving + ' ml'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {this.state.serving === false && (
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  marginTop: 20,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                <TouchableOpacity
                  onPress={() => {
                    this.getDrinkFromJames(this.props.drink);
                  }}
                  style={{
                    borderRadius: 3,
                    padding: 20,
                    marginVertical: 10,
                    marginTop: 10,
                    marginLeft: 10,
                    backgroundColor: '#1B95E0',
                    height: 60,
                  }}>
                  <Text>Serve it!</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    this.props.onCloseCancel();
                  }}
                  style={{
                    borderRadius: 3,
                    padding: 20,
                    marginVertical: 10,
                    marginTop: 10,
                    marginLeft: 10,
                    backgroundColor: '#1B95E0',
                    height: 60,
                  }}>
                  <Text>Back</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        {this.props.drink && this.state.serving === true && (
          <View
            style={{
              display: 'flex',
              marginTop: 20,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-evenly',
                width: '100%',
              }}>
              {this.props.bottles.map((bottle, index) => (
                <View
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                  <Text style={{}}>{bottle.capacity}ml</Text>
                  <Switch
                    trackColor={{false: 'gray', true: 'teal'}}
                    thumbColor="white"
                    value={this.props.servos[index]}
                    style={styles.toggleButton}></Switch>
                  <Text style={styles.bottlesText}>{bottle.name}</Text>
                </View>
              ))}
            </View>
            <View style={{marginTop: 20}}>
              <Text style={{fontSize: 20, fontWeight: 'bold'}}>
                {'Serving ' + this.state.servingText}
              </Text>
            </View>
            <View
              style={{
                flex: 2,
                flexDirection: 'row',
                padding: 20,
              }}></View>
          </View>
        )}
      </SafeAreaView>
    );
  }
}

const images = {
  humppaleka: require('./drinks/humppaleka.png'),
  gin_tonic: require('./drinks/gin_tonic.png'),
  red_drink: require('./drinks/red_drink.png'),
  grey_drink: require('./drinks/grey_drink.png'),
  sea_breeze: require('./drinks/sea_breeze.jpg'),
  cranberry_lime: require('./drinks/cranberry_lime.jpg'),
  rum_coke: require('./drinks/rum_coke.png'),
  vodka: require('./drinks/vodka.png'),
  bluemargarita: require('./drinks/margarita.png'),
  screwdriver: require('./drinks/screwdriver.jpg'),
  mikahakkinen: require('./drinks/mikahakkinen.jpg'),
  ginrickey: require('./drinks/ginrickey.jpg'),
  tequila_sunrise: require('./drinks/tequila_sunrise.png'),
  moukku: require('./drinks/moukku.jpg'),
  whiskey: require('./drinks/whiskey.png'),
};

const styles = StyleSheet.create({
  title: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 20,
  },
  toggleButton: {
    borderRadius: 3,
    padding: 20,
    marginVertical: 10,
    marginTop: 10,
  },
  bottlesText: {
    color: '#1B95E0',
    fontSize: 16,
    textAlign: 'right',
  },
});
