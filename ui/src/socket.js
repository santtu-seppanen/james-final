import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  Image,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import SocketIOClient from 'socket.io-client';
import DrinkModal from './drinkModal';
import Drink from './drink';
import Carousel from 'react-native-snap-carousel';
import InfoModal from './infoModal';
export default class Play extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      activeIndex: 0,
      servos: [false, false, false, false, false, false, false, false],
      bottles: [],
      drinks: [
        {
          friendlyname: 'Check server connection',
          ingredients: [
            {name: 'check connection', serving: 0},
            {name: 'restart device', serving: 0},
          ],
        },
      ],
      drinkFilter: '',
      filteredDrinks: [],
      errorMessage: '',
      modalVisible: false,
      selectedDrink: null,
      showInfoModal: false,
      infoMessage: '',
    };

    this.socket = SocketIOClient('http://localhost:8000');
    this.socket.connect();
    // Listens to servoState and display the data recieved
    this.socket.on('servoState', (data) => {
      console.log('Data recieved from servoState', data);
      this.setState(data);
      console.log(this.state);
    });
  }

  setModalVisible(visible) {
    this.setState({modalVisible: visible});
  }

  sendToSocket(channel) {
    console.log('Clicked ' + channel);
    console.log(this.state);
    const dataObj = {
      action: 'click',
      channel: channel,
    };

    this.socket.emit('channel' + channel, dataObj);
  }

  getDrinkFromJames(drinkName) {
    fetch('http://localhost:8000/drinkme', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({drink: drinkName}),
    })
      .then((response) => response.json())
      .then((body) => {
        // console.log(body);
      });
  }

  handleModalClick() {
    console.log(this.state);
    this.getDrinkFromJames(this.state.selectedDrink.name);

    this.setState({
      modalVisible: false,
      errorMessage: '',
    });
  }

  getCapacityTextStyle = (capacity) => {
    let color = '';

    if (capacity <= 100) color = 'red';
    else color = '#1B95E0';

    const styleObject = {
      color: color,
      textAlign: 'right',
    };

    return styleObject;
  };

  drinkSelectStart = (drink, index) => {
    var delta = new Date().getTime() - this.state.lastPress;

    if (delta < 500) {
      this.setState({selectedDrink: drink});
    }

    this.setState({
      lastPress: new Date().getTime(),
    });
  };

  toggleFilter = (bottle) => {
    const drinkFilter =
      this.state.drinkFilter === bottle.name ? '' : bottle.name;

    this.setState({
      drinkFilter: drinkFilter,
    });

    this.filterDrinks(drinkFilter);
  };

  toggleInfoModal = (message) => {
    this.setState({
      infoMessage: message,
      showInfoModal: true,
    });

    setTimeout(
      () =>
        this.setState({
          infoMessage: '',
          showInfoModal: false,
        }),
      3000,
    );
  };

  drinkCancelled = () => {
    this.setState({selectedDrink: null});
  };

  drinkPoured = () => {
    console.log(this.state.selectedDrink);
    const manualIngredients = this.state.selectedDrink.ingredients.filter(
      (ingredient) => {
        return ingredient.manual;
      },
    );

    if (manualIngredients.length === 0) {
      this.toggleInfoModal('Drink ready, enjoy!');
    } else {
      const ingredientStrings = manualIngredients.map(
        (ingredient) => `${ingredient.serving}ml of ${ingredient.name}`,
      );
      this.toggleInfoModal(
        `Drink poured, add ${ingredientStrings.join(', ')} and enjoy`,
      );
    }

    this.setState({selectedDrink: null});
  };

  filterDrinks = (filter) => {
    if (!filter) {
      this.setState({
        filteredDrinks: this.state.drinks,
      });
    } else {
      let filteredDrinks = [];
      this.state.drinks.forEach((drink) => {
        const foundBottle = drink.ingredients.find((ingredient) => {
          return (
            ingredient.name.replace(' ', '').toUpperCase() ===
            filter.replace(' ', '').toUpperCase()
          );
        });
        if (foundBottle) {
          filteredDrinks.push(drink);
        }
      });

      this.setState({
        filteredDrinks: filteredDrinks,
      });
    }
  };

  _renderItem({item, index}) {
    return (
      <View style={styles.carousel}>
        <TouchableHighlight
          style={{flex: 1}}
          onPress={() => {
            this.drinkSelectStart(item, index);
          }}>
          <View style={{alignItems: 'center'}}>
            <Text style={styles.imageButton}>{item.friendlyname}</Text>
            {images[item.imageUrl] !== undefined ? (
              <Image
                source={images[item.imageUrl]}
                style={{width: 200, height: 200}}></Image>
            ) : (
              <Image
                source={require('./drinks/drink.png')}
                style={{width: 100, height: 100}}></Image>
            )}
          </View>
        </TouchableHighlight>
      </View>
    );
  }

  render() {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
          backgroundColor: 'white',
        }}>
        <View>
          {this.state.bottles.map((bottle, index) => {
            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'right',
                  height: 60,
                }}>
                <TouchableOpacity
                  onPress={() => this.toggleFilter(bottle)}
                  key={index}>
                  <Text
                    style={
                      this.state.drinkFilter === bottle.name
                        ? styles.menuButtonSelected
                        : styles.menuButton
                    }>
                    {bottle.name}
                  </Text>
                </TouchableOpacity>
                <View>
                  <Text
                    style={{
                      transform: [
                        {
                          rotate: '90deg',
                        },
                      ],
                      position: 'relative',
                      zIndex: 99,
                      top: 30,
                      fontSize: 10,
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}>
                    {bottle.capacity}
                  </Text>
                  <svg
                    style={{
                      width: 30,
                      height: 60,
                      top: -5,
                      position: 'relative',
                      zIndex: 1,
                    }}
                    data-name="Layer 1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 21 51">
                    <defs>
                      <mask id="milk-mask">
                        <rect
                          x="477"
                          y="108"
                          width="15"
                          height="40"
                          transform="rotate(-180 247.5 78.5)"
                          fill="#ffffff"
                          animation="fill 2s ease-in-out infinite"
                        />
                      </mask>
                    </defs>
                    <path
                      className="bottle"
                      d="M19 21.1L15 8.74V6a2.3 2.3 0 0 0-.14-.9 1.54 1.54 0 0 0 .14-.65V3c0-.85-.35-1.5-1.19-1.5H7.86C7.02 1.5 6 2.15 6 3v1.47a1.55 1.55 0 0 0 .22.79 1.32 1.32 0 0 0-.22.76v2.72L2 21.09a12.12 12.12 0 0 0-.51 3.21v22.1a3.29 3.29 0 0 0 3.15 3.1h12a2.92 2.92 0 0 0 2.85-3.1V24.3a12.14 12.14 0 0 0-.49-3.2zM7.69 3h5.81v1.47a3.12 3.12 0 0 0 .31.08h-.08l-6-.05zM18 46.4a1.63 1.63 0 0 1-1.4 1.58H4.65C3.93 47.98 3 46.85 3 46.4V24.3a11 11 0 0 1 .61-2.73L7.72 9.1l.08-3a3.72 3.72 0 0 1 .88-.06h4.82v2.79l4.06 12.71a10.67 10.67 0 0 1 .44 2.73z"
                      fill="lightblue"
                    />
                    <path
                      className="milk"
                      mask="url(#milk-mask)"
                      d="M4.5 46.5v-23l4-14h4l4 14v23"
                      fill="lightblue"
                    />
                  </svg>
                </View>
              </View>
            );
          })}
        </View>
        {this.state.selectedDrink === null && (
          <View
            style={{
              flex: 1,
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
            }}>
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
              }}>
              <Carousel
                layout={'default'}
                ref={(ref) => (this.carousel = ref)}
                data={
                  this.state.drinkFilter
                    ? this.state.filteredDrinks
                    : this.state.drinks
                }
                sliderWidth={Dimensions.get('window').width - 200}
                itemWidth={300}
                itemHeight={400}
                renderItem={this._renderItem.bind(this)}
                onSnapToItem={(index) => this.setState({activeIndex: index})}
              />
            </View>
            {this.state.modalVisible === true && (
              <DrinkModal
                visible={this.state.modalVisible}
                message={this.state.errorMessage}
                onAcceptClick={() => this.handleModalClick()}
                onCancelClick={() => this.setModalVisible(false)}
              />
            )}
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignSelf: 'flex-end',
              }}>
              <TouchableOpacity
                onPress={() => {
                  this.props.navigation.push('SingleRecipeConfig', {
                    recipe: {
                      friendlyname: 'ADD NEW',
                      ingredients: [],
                      imageUrl: 'humppaleka',
                    },
                    drinks: this.state.drinks,
                  });
                }}
                style={{alignSelf: 'flex-end', top: 60, marginRight: 20}}>
                <Image
                  source={require('./icons/plus.png')}
                  style={{
                    height: 30,
                    width: 30,
                    backgroundColor: 'white',
                  }}></Image>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => this.props.navigation.navigate('RecipeSetup')}
                style={{alignSelf: 'flex-end', top: 60, marginRight: 20}}>
                <Image
                  source={require('./icons/cookbook.png')}
                  style={{
                    height: 30,
                    width: 30,
                    backgroundColor: 'white',
                  }}></Image>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => this.props.navigation.navigate('BottleSetup')}
                style={{alignSelf: 'flex-end', top: 60, marginRight: 20}}>
                <Image
                  source={require('./icons/bottles.png')}
                  style={{
                    height: 30,
                    width: 30,
                    backgroundColor: 'white',
                  }}></Image>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {this.state.selectedDrink !== null && (
          <Drink
            drink={this.state.selectedDrink}
            onCloseDetail={() => this.drinkPoured()}
            onCloseCancel={() => this.drinkCancelled()}
            bottles={this.state.bottles}
            servos={this.state.servos}></Drink>
        )}

        {this.state.showInfoModal && (
          <View style={{position: 'absolute'}}>
            <InfoModal
              visible={this.state.showInfoModal}
              message={this.state.infoMessage}
            />
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
    color: '#1B95E0',
    fontWeight: 'bold',
    fontSize: 16,
  },
  toggleButton: {
    borderRadius: 3,
    padding: 20,
    marginVertical: 10,
    marginTop: 10,
    marginLeft: 30,
  },
  button: {
    borderRadius: 3,
    padding: 20,
    marginVertical: 10,
    marginTop: 10,
    marginLeft: 10,
    backgroundColor: '#1B95E0',
    height: 60,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  bottlesText: {
    color: '#1B95E0',
    fontSize: 16,
    textAlign: 'right',
  },
  imageButton: {
    borderRadius: 3,
    padding: 20,
    color: '#1B95E0',
    fontWeight: 'bold',
    fontSize: 16,
  },
  imageButtonContainer: {
    marginTop: 10,
    marginLeft: 10,
    marginVertical: 10,
    height: 60,
  },
  selectedDrinkText: {
    color: '#1B95E0',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  carousel: {
    borderColor: '#333',
    borderRadius: 15,
    borderWidth: 1,
    height: 300,
    width: 250,
    backgroundColor: 'white',
  },
  menuButton: {
    padding: 20,
    backgroundColor: 'purple',
    color: 'white',
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
    borderWidth: 1,
    borderColor: 'purple',
    width: 120,
  },
  menuButtonSelected: {
    padding: 20,
    backgroundColor: 'white',
    color: '#333',
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
    borderWidth: 1,
    borderColor: 'white',
    width: 120,
  },
  milkBottle: {
    width: '50%',
    height: '50%',
  },
  maskRect: {
    animationKeyframes: 'fill 2s ease-in-out infinite',
  },
});
